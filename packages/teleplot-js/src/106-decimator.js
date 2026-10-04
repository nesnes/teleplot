/**
 * Min/max decimation of a time-ordered series, for display purposes.
 *
 * A screen only has a few thousand pixel columns, so drawing millions of samples is wasteful: within one
 * pixel column only the first, minimum, maximum and last samples change what the line looks like.
 * The decimator splits time into fixed-width buckets and keeps those (at most) 4 samples per bucket.
 * The source data is never modified or copied: only a small display copy is cached.
 *
 * - Buckets are aligned on absolute time (bucket n = [n*width, (n+1)*width[), so a scrolling window
 *   doesn't make the line shimmer, and finished buckets can be cached.
 * - The bucket width is a power of two, so it only changes (and the cache is rebuilt) when the visible
 *   range doubles or halves.
 * - Incremental: when data is appended, only the new samples and the last (still open) bucket are scanned.
 * - Non-finite values (NaN, Infinity) are ignored.
 *
 * The source is a datastore data entry: { timestamps: [...], data: [[channel0...], ...], lateInsertions }
 * The cache is rebuilt from scratch if samples were inserted before the end of the data (lateInsertions
 * changed), if the data was replaced, or if the visible range starts before the cached range.
 */

// Index of the first element >= x in a sorted array
function _lowerBound(sortedArray, x) {
    let low = 0;
    let high = sortedArray.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (sortedArray[mid] < x) low = mid + 1;
        else high = mid;
    }
    return low;
}

class MinMaxDecimator {
    constructor(channel = 0) {
        this.channel = channel;
        this.startCache(null, 0, 0);
    }

    // Bucket width (in timestamp unit) giving at most maxBuckets over [from, to]
    static bucketWidthFor(from, to, maxBuckets) {
        const range = Math.max(to - from, 1e-6);
        return 2 ** Math.ceil(Math.log2(range / Math.max(maxBuckets, 1)));
    }

    /**
     * Decimated view of the source over [from, to] (the view slightly overshoots to the nearest bucket edges).
     * @returns {{timestamps: number[], values: number[]}} fresh arrays, safe to modify
     */
    getView(source, from, to, maxBuckets) {
        const bucketWidth = MinMaxDecimator.bucketWidthFor(from, to, maxBuckets);
        const firstBucket = Math.floor(from / bucketWidth);
        const endBucket = Math.floor(to / bucketWidth) + 1; // Excluded

        if (!this.isCacheValid(source, bucketWidth, firstBucket)) {
            this.startCache(source, bucketWidth, firstBucket);
        }
        this.dropCacheBefore(firstBucket);

        const open = this.extendCache(endBucket);
        const cachedCount = _lowerBound(this.timestamps, endBucket * bucketWidth); // The cache can go further than a shrunk range
        return {
            timestamps: this.timestamps.slice(0, cachedCount).concat(open.timestamps),
            values: this.values.slice(0, cachedCount).concat(open.values)
        };
    }

    isCacheValid(source, bucketWidth, firstBucket) {
        return source === this.source
            && source.lateInsertions === this.lateInsertions
            && bucketWidth === this.bucketWidth
            && firstBucket >= this.firstBucket;
    }

    startCache(source, bucketWidth, firstBucket) {
        this.source = source;
        this.lateInsertions = source ? source.lateInsertions : 0;
        this.bucketWidth = bucketWidth;
        this.firstBucket = firstBucket; // First bucket held in the cache
        this.nextBucket = firstBucket;  // First bucket not yet in the cache (finished buckets only)
        this.timestamps = [];           // Cached (finished buckets) decimated data
        this.values = [];
    }

    // Forget cached buckets that are before the visible range
    dropCacheBefore(bucket) {
        const count = _lowerBound(this.timestamps, bucket * this.bucketWidth);
        this.timestamps.splice(0, count);
        this.values.splice(0, count);
        this.firstBucket = bucket;
        this.nextBucket = Math.max(this.nextBucket, bucket);
    }

    /**
     * Process source samples that are not cached yet, up to endBucket (excluded).
     * Finished buckets are added to the cache, the last one may still receive data and is returned instead.
     * @returns {{timestamps: number[], values: number[]}} decimated data of the open bucket (or empty)
     */
    extendCache(endBucket) {
        const timestamps = this.source.timestamps;
        const values = this.source.data[this.channel];
        const endTimestamp = endBucket * this.bucketWidth;
        const open = { timestamps: [], values: [] };

        let bucket = null; // Bucket being scanned
        let idx = _lowerBound(timestamps, this.nextBucket * this.bucketWidth);
        for (; idx < timestamps.length && timestamps[idx] < endTimestamp; idx++) {
            if (!Number.isFinite(values[idx])) continue;
            const bucketIdx = Math.floor(timestamps[idx] / this.bucketWidth);
            if (bucket === null || bucketIdx !== bucket.idx) {
                if (bucket !== null) this.cacheBucket(bucket);
                bucket = { idx: bucketIdx, first: idx, last: idx, min: idx, max: idx };
            }
            bucket.last = idx;
            if (values[idx] < values[bucket.min]) bucket.min = idx;
            if (values[idx] > values[bucket.max]) bucket.max = idx;
        }
        if (bucket === null) return open;

        // Some data exists after this bucket: it is finished. Otherwise new data may still land in it.
        if (idx < timestamps.length) this.cacheBucket(bucket);
        else this.appendBucket(bucket, open.timestamps, open.values);
        return open;
    }

    cacheBucket(bucket) {
        this.appendBucket(bucket, this.timestamps, this.values);
        this.nextBucket = bucket.idx + 1;
    }

    // Append the samples worth keeping of a bucket (in time order, without duplicates)
    appendBucket(bucket, outTimestamps, outValues) {
        const timestamps = this.source.timestamps;
        const values = this.source.data[this.channel];
        const kept = [bucket.first, bucket.min, bucket.max, bucket.last].sort((a, b) => a - b);
        for (let i = 0; i < kept.length; i++) {
            if (i > 0 && kept[i] === kept[i - 1]) continue;
            outTimestamps.push(timestamps[kept[i]]);
            outValues.push(values[kept[i]]);
        }
    }
}
