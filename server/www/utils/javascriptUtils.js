function copyArray(src_array)
{
    let destArray = [];
    for (let i = 0; i < src_array.length; i++)
        destArray.push(src_array[i]);

    return destArray;
}