@startuml

abstract class Connection {
    {static} ConnectionCount : Number
    name : String
    id : String
    type : String
    connected : boolean
    inputs : DataInput []

    void connect()
    void removeInput(input : DataInput)
}

class ConnectionTeleplotVSCode extends Connection {
    vscode : Object
    udp : DataInputUDP
    supportSerial : boolean

    void connect()
    void disconnect()
    void sendServerCommand(command : {id : String, cmd : String, text : String})
    void sendCommand(command : String)
    void updateCMDList()
    void createInput(type : String)
}

class ConnectionTeleplotWebsocket extends Connection {
    socket : WebSocket
    address : String
    port : String
    udp : DataInputUDP

    void connect(_address : String, _port : Number)
    void disconnect()
    void sendServerCommand(command : {id : String, cmd : String, text : String})
    void updateCMDList()
    void createInput(type : String)
}

abstract class DataInput {
    {static} DataInputCount : Number
    connection : Connection
    name : String
    id : String
    type : String
    connected : boolean

    void connect()
    void disconnect()
}

class DataInputSerial extends DataInput {
    port : String
    baudrate : Number
    portList : Portinfo []
    textToSend : String
    endlineToSend : String

    void connect()
    void disconnect()
    void onMessage(msg : {id : Number, input : DataInput, cmd : String, list : Portinfo []})
    void listPorts()
    void sendCommand()
    void updateCMDList()
    void sendText(text : String, lineEndings : String)
}

class DataInputUDP extends DataInput {
    address : String
    port : Number

    void connect()
    void disconnect()
    void onMessage(msg : Object)
    void sendCommand(command : String)
    void updateCMDList()
}

class DataWidget {
    {static} widgetCount : Number
    - {static} widgetBeingResized : DataWidget
    label : String
    options : Object
    series : DataSerie []
    id : String
    gridPos : {h : Number, w : Number, x : Number, y : Number}
    - initialCursorXPos : Number
    - initialCursorYPos : Number
    - initialHeight : Number
    - initialWidth : Number
    - isResized : boolean

    void isUsingSource(name : String)
    DataSerie [] _getSourceList()
    void updateStats()
}

class ChartWidget extends DataWidget {
    isXY : boolean
    data : Object
    options : { title : String, width : Number, height : Number, scales : Object, series : DataSerie [], focus : Object, cursor : Object, legend : Object}
    forceUpdate : boolean

    void destroy()
    void addSerie(serie : DataSerie)
    void removeSerie(serie : DataSerie)
    void update()
}

class JPGWidget extends DataWidget {
    type : String
    image : Object

    void addSerie(serie : DataSerie)
    void destroy()
    void update()
}

class SingleValueWidget extends DataWidget {
    type : String
    singlevalue : Number []
    precision_mode : Number

    void addSerie(serie : DataSerie)
    void destroy()
    void trimNumberAccordingToPrecision(nb : Number)
    void updateSingleValue(currentSerie : DataSerie)
    void update()
    void changeValuePrecision()
}

class Widget3D extends DataWidget {
    type : String
    worldId : Number
    onNewSerieAdded : Object
    onSerieRemoved : Object

    void addSerie(serie : DataSerie)
    void removeSerie(serie : DataSerie)
    void destroy()
    void update()
}

class DataSerie {
    {static} DataSerieIdCount : Number
    type : String
    name : String
    id : String
    sourceNames : String []
    formula : String
    initialized : boolean
    dataIdx : Number
    data : Number [][]
    pendingData : Number [][]
    options : { _serie : String, stroke : String, fill : String, paths : Fun}
    _values : Object
    stats : {min : Number, max : Number, sum : Number, mean : Number, med : Number, stedv : Number}
    unit : String
    values_formatted : String
    name_color : String
    details_3d_formatted : Object
    onSerieChanged : Object

    void destroy()
    void addSource(name : String)
    void update()
    void updateStats()
    void applyTimeWindow()
}

class Telemetry {
    type : String
    name : String
    unit : String
    usageCount : Number
    values : Object
    data : Number [][]
    pendingData : Number [][]
    values_formatted : String

    void setShapeTypeDelay()
    void setShapeType()
    void iniFromTelem(telem : Object)
    void updateFormattedValues()
}

Connection <|-- ConnectionTeleplotVSCode
Connection <|-- ConnectionTeleplotWebsocket

Connection "1" <--> "0..*" DataInput

DataInput <|-- DataInputSerial
DataInput <|-- DataInputUDP

DataWidget <|-- ChartWidget
DataWidget <|-- JPGWidget
DataWidget <|-- SingleValueWidget
DataWidget <|-- Widget3D

DataWidget --> "0..*" DataSerie

DataSerie --> Telemetry

@enduml

/'
Portinfo doc : https://serialport.io/docs/api-bindings-cpp#list
'/