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

function isLetter(c)
{
    return ((c>='a' && c<='z') || (c>='A' && c<='Z'));
}
