function computeStats(data) {
    let decPrecision = 4;

    let mToFixed = (nb) => {
        if (typeof(nb) == 'number') 
            return nb.toFixed(decPrecision);
        
        return nb.toString();
    }

    let stats = {
        min:"0",
        max:"0",
        sum:"0",
        mean:"0",
        med:"0",
        stdev:"0",
    };
    let values = data[1];

    //Find min/max indexes from timestampWindow
    let minIdx = 0, maxIdx = data[1].length;

    if(timestampWindow.min !=0 && timestampWindow.max != 0)
    {
        minIdx = findClosestLowerByIdx(data[0], timestampWindow.min) + 1;
        maxIdx = findClosestLowerByIdx(data[0], timestampWindow.max);
        if(maxIdx<=minIdx || maxIdx>=data[0].length) return stats;


        if (!app.isViewPaused)
            maxIdx = values.length;

        values = data[1].slice(minIdx, maxIdx);
    }
    if(values.length==0) return stats;

    // Sort
    let arr = values.sort(function compareFn(a, b) { return a-b});
    if(arr.length==0) return stats;

    // Min, Max
    stats.min = mToFixed(arr[0]);
    stats.max = mToFixed(arr[arr.length-1]);

    // Sum, Mean
    let sum = 0;
    for(let i=0;i<arr.length;i++) {
        sum += arr[i];
    }
    stats.sum = mToFixed(sum);
    let mean = sum / arr.length;
    stats.mean = mToFixed(mean);

    // Stdev
    let stdevSum=0;
    for(let i=0;i<arr.length;i++) {
        stdevSum += (arr[i] - mean) * (arr[i] - mean);
    }
    stats.stdev = mToFixed(Math.sqrt(stdevSum/arr.length));

    // Median (only one that requires the costly sort)
    var midSize = arr.length / 2;
	let med = midSize % 1 ? arr[midSize - 0.5] : (arr[midSize - 1] + arr[midSize]) / 2;
    stats.med = mToFixed(med);

    return stats;
}