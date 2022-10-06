function my_copyArray(src_array)
{
    if (src_array == undefined) return undefined;
    
    let destArray = [];
    for (let i = 0; i < src_array.length; i++)
    {
        let copyEl;

        if (typeof(src_array[i]) == Object)
            copyEl = JSON.parse(JSON.stringify(src_array[i]));
        else
            copyEl = src_array[i];

        destArray.push(copyEl);

    }

    return destArray;
}


function areShape3DArraySame(array1, array2)
{
    if (array1.length != array2.length)
        return false;
    
    for (let i = 0; i < array1.length; i++)
    {
        if (!array1[i].isSame(array2[i]))
            return false;
    }

    return true;
}