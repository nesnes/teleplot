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