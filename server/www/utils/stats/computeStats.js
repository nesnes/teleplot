function computeStats(data) {
    let stats = {
        min:0,
        max:0,
        sum:0,
        mean:0,
        med:0,
        stdev:0,
    };
    let values = data[1];
    //Find min/max indexes from timestampWindow
    let minIdx = 0, maxIdx = data[1].length;
    if(timestampWindow.min !=0 && timestampWindow.max != 0)
    {
        minIdx = findClosestLowerByIdx(data[0], timestampWindow.min) + 1;
        maxIdx = findClosestLowerByIdx(data[0], timestampWindow.max);
        if(maxIdx<=minIdx || maxIdx>=data[0].length) return stats;
        values = data[1].slice(minIdx, maxIdx);
    }
    if(values.length==0) return stats;
    // Sort
    let arr = values.slice().sort(function(a, b){return a - b;});
    for(let i=0;i<arr.length;i++) {
        if(!isFinite(arr[i]) || isNaN(arr[i])) {
            arr.splice(i,1);
            i--;
        }
    }
    if(arr.length==0) return stats;
    // Min, Max
    stats.min = arr[0];
    stats.max = arr[arr.length-1];
    // Sum, Mean
    for(let i=0;i<arr.length;i++) {
        stats.sum += arr[i];
    }
    stats.mean = stats.sum / arr.length;
    // Stdev
    let stdevSum=0;
    for(let i=0;i<arr.length;i++) {
        stdevSum += (arr[i] - stats.mean) * (arr[i] - stats.mean);
    }
    stats.stdev = Math.sqrt(stdevSum/arr.length);
    // Median (only one that requires the costly sort)
    var midSize = arr.length / 2;
	stats.med = midSize % 1 ? arr[midSize - 0.5] : (arr[midSize - 1] + arr[midSize]) / 2;
    return stats;
}

