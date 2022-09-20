@startuml

abstract class Connection {
    {static} ConnectionCount : Number 
    name : String
    id : String
    type : String
    connected : boolean
    inputs : DataInput []

    void connect(void)
    void removeInput(input : DataInput)
}

class ConnectionTeleplotVSCode {
  vscode : boolean
  udp : DataInputUDP
  supportSerial : boolean
  
  void connect(void)
  void disconnect(void)
  void sendServerCommand(command : {id : String, cmd : String, text : String})
  void sendCommand(command : String)
  void updateCMDList(void)
  void createInput(type : String)
}

class ConnectionTeleplotWebSocket {
  socket : WebSocket
  adress : String
  port : String
  udp : DataInputUDP
  
  void connect(_address : String, _port : Number)
  void disconnect(void)
  void sendServerCommand(command : {id : String, cmd : String, text : String}) 
  void updateCMDList(void)
  void createInput(type : String)
}

abstract class DataInput {
  {static} DataInputCount : Number
  connection : Connection
  name : String
  id : String
  type : String
  connected : boolean
}

class DataInputSerial {
  port : Number
  baudrate : Number
  portList : Portinfo []
  textToSend : String
  endlineToSend : String
  
  void connect(void)
  void disconnect(void)
  void onMessage(msg : { id : Number, input : DataInput, cmd : String, list : Portinfo []} )
  void listPorts(void)
  void sendCommand(void)
  void updateCMDList(void)
  void sendText(text : String, lineEndings : String)
  
}

class DataInputUDP {
  adress : String
  port : Number
  
  void connect(void)
  void disconnect(void)
  void onMessage(msg : String)
  void sendCOmmand(command : String)
  void updateCMDList(void)

}

class ChartWidget {
  isXY : boolean
  data : Number [][][]
  options : { title : String, width : Number, height : Number, scales : Object, series : DataSerie [], focus : Object, cursor : Object, legend : Object}
  forceUpdate : boolean
  
  void destroy(void)
  void addSerie(DataSerie)
  void update(void)

}

class DataSerie {
  {static} DataSerieIdCount : Number
  name : String
  id : String
  sourceNames : String []
  formula : String
  initialized : boolean
  dataIdx : Number
  data : Number [][]
  pendingData : Number [][]
  options : { _serie : String, stroke : String, fill : String, paths : Fun}
  value : Number
  stats : {min : Number, max : Number, sum : Number, mean : Number, med : Number, stedv : Number}

  void destroy(void)
  void addSource(name : String)
  void update(void)
  void updateStats(void)
  void applyTimeWindow(void)
  
}

abstract class DataWidget {
  {static} widgetCount : Number
  - {static} widgetBeingResized : DataWidget
  series : DataSerie []
  type : String
  id : String
  gridPos : {h : Number, w : Number, x : Number, y : Number}
  - initialCursorPos : Number
  - initialCursorYPos : Number
  - initialHeight : Number
  - initialWidth : Number
  - isResized : Number

  void isUsingSource(name : String)
  DataSerie [] _getSourceList(void)
  void updateStats(void)
}



Connection <|-- ConnectionTeleplotVSCode
Connection <|-- ConnectionTeleplotWebSocket

Connection "1" <--> "0..*" DataInput

DataWidget --> "0..*" DataSerie

DataInput <|-- DataInputUDP
DataInput <|-- DataInputSerial

DataWidget <|-- ChartWidget

@enduml

/'
Portinfo doc : https://serialport.io/docs/api-bindings-cpp#list
'/