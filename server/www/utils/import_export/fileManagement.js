function saveFile(content, filename) {
    if(vscode){
        vscode.postMessage({ cmd: "saveFile", file: {
            name: filename,
            content: content
        }});
    }
    else {
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}

function buildFileName(fileContentType, fileExtension)
{
    let fileName = "teleplot_";

    if (fileContentType === "layout")
        fileName += "layout_";
    
    let now = new Date();

    fileName +=  (now.getFullYear() + "-" + (now.getMonth()+1) + "-" + now.getDate() + "_" + now.getHours() + "-" + now.getMinutes());
    fileName += ( "." + fileExtension );

    return fileName;
}