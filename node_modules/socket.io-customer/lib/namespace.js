
/**
 * Module dependencies.
 */

var Socket = require('./socket');
var Emitter = require('events').EventEmitter;
var parser = require('socket.io-parser');
var hasBin = require('has-binary');
var debug = require('debug')('socket.io:namespace');

/**
 * Module exports.
 */

module.exports = exports = Namespace;

/**
 * Blacklisted events.
 */

exports.events = [
  'connect',    // for symmetry with client
  'connection',
  'newListener'
];

/**
 * Flags.
 */

exports.flags = [
  'json',
  'volatile',
  'local'
];

/**
 * `EventEmitter#emit` reference.
 */

var emit = Emitter.prototype.emit;

/**
 * Namespace constructor.
 *
 * @param {Server} server instance
 * @param {Socket} name
 * @api private
 */

function Namespace(server, name){
  this.name = name;
  this.server = server;
  this.sockets = {};
  this.connected = {};
  this.fns = [];
  this.ids = 0;
  this.rooms = [];
  this.flags = {};
  this.initAdapter();
}

/**
 * Inherits from `EventEmitter`.
 */

Namespace.prototype.__proto__ = Emitter.prototype;

/**
 * Apply flags from `Socket`.
 */

exports.flags.forEach(function(flag){
  Object.defineProperty(Namespace.prototype, flag, {
    get: function() {
      this.flags[flag] = true;
      return this;
    }
  });
});

/**
 * Initializes the `Adapter` for this nsp.
 * Run upon changing adapter by `Server#adapter`
 * in addition to the constructor.
 *
 * @api private
 */

Namespace.prototype.initAdapter = function(){
  this.adapter = new (this.server.adapter())(this);
};

/**
 * Sets up namespace middleware.
 *
 * @return {Namespace} self
 * @api public
 */

Namespace.prototype.use = function(fn){
  if (this.server.eio && this.name === '/') {
    debug('removing initial packet');
    delete this.server.eio.initialPacket;
  }
  this.fns.push(fn);
  return this;
};

/**
 * Executes the middleware for an incoming client.
 *
 * @param {Socket} socket that will get added
 * @param {Function} fn last fn call in the middleware
 * @api private
 */

Namespace.prototype.run = function(socket, fn){
  var fns = this.fns.slice(0);
  if (!fns.length) return fn(null);

  function run(i){
    fns[i](socket, function(err){
      // upon error, short-circuit
      if (err) return fn(err);

      // if no middleware left, summon callback
      if (!fns[i + 1]) return fn(null);

      // go on to next
      run(i + 1);
    });
  }

  run(0);
};

/**
 * Targets a room when emitting.
 *
 * @param {String} name
 * @return {Namespace} self
 * @api public
 */

Namespace.prototype.to =
    Namespace.prototype.in = function(name){
      if (!~this.rooms.indexOf(name)) this.rooms.push(name);
      return this;
    };

/**
 * Adds a new client.
 *
 * @return {Socket}
 * @api private
 */

Namespace.prototype.add = function(client, query, fn){
  debug('adding socket to nsp %s', this.name);
  var socket = new Socket(this, client, query);
  var self = this;
  this.run(socket, function(err){
    process.nextTick(function(){
      if ('open' == client.conn.readyState) {
        if (err) return socket.error(err.data || err.message);

        // track socket
        self.sockets[socket.id] = socket;

        // it's paramount that the internal `onconnect` logic
        // fires before user-set events to prevent state order
        // violations (such as a disconnection before the connection
        // logic is complete)
        socket.onconnect();
        if (fn) fn();

        // fire user-set events
        self.emit('connect', socket);
        self.emit('connection', socket);
      } else {
        debug('next called after client was closed - ignoring socket');
      }
    });
  });
  return socket;
};

/**
 * Removes a client. Called by each `Socket`.
 *
 * @api private
 */

Namespace.prototype.remove = function(socket){
  if (this.sockets.hasOwnProperty(socket.id)) {
    delete this.sockets[socket.id];
  } else {
    debug('ignoring remove for %s', socket.id);
  }
};

/**
 * Emits to all clients.
 *
 * @return {Namespace} self
 * @api public
 */
Namespace.prototype.customEncode = function(args){
  var args = Array.prototype.slice.call(arguments);
  var packet = {
    type: (this.flags.binary !== undefined ? this.flags.binary : hasBin(args)) ? parser.BINARY_EVENT : parser.EVENT,
    data: args
  };

  packet.nsp =  this.name;

  // if (exports.BINARY_EVENT === obj.type || exports.BINARY_ACK === obj.type) {
  //     encodeAsBinary(obj, callback);
  // } else {
  //     var encoding = encodeAsString(obj);
  //     callback([encoding]);
  // }

  let encoded = [encodeAsString(packet)];
  console.log('encodedPacket: ', encoded)

  var eioPacket = {
    type: 'message',
    options: {compress: true}
  };
  if (encoded) eioPacket.data = encoded;
  return eioPacket;
}

Namespace.prototype.eioEmit = function(eioPacket){

  var rooms = this.rooms.slice(0);
  var flags = Object.assign({}, this.flags);

  // reset flags
  this.rooms = [];
  this.flags = {};

  let id = rooms[0];
  let socket = this.connected[id];

  console.log('eioPacket: ', eioPacket);

  let eio = socket.client.conn;
  eio.emit('packetCreate', eioPacket);

  eio.writeBuffer.push(eioPacket);

  eio.flush();

  return this;
}

Namespace.prototype.customemit = function(ev, encodedPacket){
  if (~exports.events.indexOf(ev)) {
    emit.apply(this, arguments);
    return this;
  }
  var args = Array.prototype.slice.call(arguments);

  if ('function' == typeof args[args.length - 1]) {
    throw new Error('Callbacks are not supported when broadcasting');
  }

  var rooms = this.rooms.slice(0);
  var flags = Object.assign({}, this.flags);

  // reset flags
  this.rooms = [];
  this.flags = {};

  let opts =  {}
  opts.preEncoded = true;
  opts.compress = true;
  let id = rooms[0];
  let socket = this.connected[id];
  socket.client.packet(encodedPacket,opts)

  return this;
}
Namespace.prototype.emit = function(ev){
  if (~exports.events.indexOf(ev)) {
    emit.apply(this, arguments);
    return this;
  }
  // set up packet object
  var args = Array.prototype.slice.call(arguments);
  var packet = {
    type: (this.flags.binary !== undefined ? this.flags.binary : hasBin(args)) ? parser.BINARY_EVENT : parser.EVENT,
    data: args
  };

  if ('function' == typeof args[args.length - 1]) {
    throw new Error('Callbacks are not supported when broadcasting');
  }

  var rooms = this.rooms.slice(0);
  var flags = Object.assign({}, this.flags);

  // reset flags
  this.rooms = [];
  this.flags = {};

  this.adapter.broadcast(packet, {
    rooms: rooms,
    flags: flags
  });

  return this;
};

/**
 * Sends a `message` event to all clients.
 *
 * @return {Namespace} self
 * @api public
 */

Namespace.prototype.send =
    Namespace.prototype.write = function(){
      var args = Array.prototype.slice.call(arguments);
      args.unshift('message');
      this.emit.apply(this, args);
      return this;
    };

/**
 * Gets a list of clients.
 *
 * @return {Namespace} self
 * @api public
 */

Namespace.prototype.clients = function(fn){
  if(!this.adapter){
    throw new Error('No adapter for this namespace, are you trying to get the list of clients of a dynamic namespace?')
  }
  this.adapter.clients(this.rooms, fn);
  // reset rooms for scenario:
  // .in('room').clients() (GH-1978)
  this.rooms = [];
  return this;
};

/**
 * Sets the compress flag.
 *
 * @param {Boolean} compress if `true`, compresses the sending data
 * @return {Socket} self
 * @api public
 */

Namespace.prototype.compress = function(compress){
  this.flags.compress = compress;
  return this;
};

/**
 * Sets the binary flag
 *
 * @param {Boolean} Encode as if it has binary data if `true`, Encode as if it doesnt have binary data if `false`
 * @return {Socket} self
 * @api public
 */

Namespace.prototype.binary = function (binary) {
  this.flags.binary = binary;
  return this;
};

function encodeAsString(obj) {

  // first is type
  var str = '' + obj.type;

  // attachments if we have them
  if (exports.BINARY_EVENT === obj.type || exports.BINARY_ACK === obj.type) {
    str += obj.attachments + '-';
  }

  // if we have a namespace other than `/`
  // we append it followed by a comma `,`
  if (obj.nsp && '/' !== obj.nsp) {
    str += obj.nsp + ',';
  }

  // immediately followed by the id
  if (null != obj.id) {
    str += obj.id;
  }

  // json data
  if (null != obj.data) {
    var payload = tryStringify(obj.data);
    if (payload !== false) {
      str += payload;
    } else {
      return ERROR_PACKET;
    }
  }

  debug('encoded %j as %s', obj, str);
  return str;
}

function tryStringify(str) {
  try {
    return JSON.stringify(str);
  } catch(e){
    return false;
  }
}


function encodeAsBinary(obj, callback) {

  function writeEncoding(bloblessData) {
    var deconstruction = binary.deconstructPacket(bloblessData);
    var pack = encodeAsString(deconstruction.packet);
    var buffers = deconstruction.buffers;

    buffers.unshift(pack); // add packet info to beginning of data list
    callback(buffers); // write all the buffers
  }

  binary.removeBlobs(obj, writeEncoding);
}