TELEPLOT.clients = {
    clients: {}
}

class Client {
    constructor(id, name="") {
        this.id = id;
        this.name = name;
    }
}

TELEPLOT.clients.getClient = function(id) {
    return TELEPLOT.clients.clients[id];
}

TELEPLOT.clients.hasClient = function(id) {
    return TELEPLOT.clients.getClient(id) !== undefined;
}

TELEPLOT.clients.addClient = function(id) {
    if (TELEPLOT.clients.hasClient(id)) {
        console.error(Error(`Trying to add existing client : ${id}`));
        return;
    }
    let client = new Client(id);
    TELEPLOT.clients.clients[id] = client;
    return client;
}

TELEPLOT.clients.getOrCreateClient = function(id) {
    let client = TELEPLOT.clients.getClient(id);
    if(client === undefined) {
        client = TELEPLOT.clients.addClient(id);
    }
    return client;
}