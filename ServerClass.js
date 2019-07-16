const http = require('http').Server();
const io = require('socket.io-customer');
const fs = require('fs')
const {log} = console

class Server{
    constructor(port=133){
        let getThis = () => this;
        this.http = http;
        this.server = new io(http);
        this.users = {};
        let self = this;
        this.addSocket = function (socket) {
            console.log('a use connected');
            console.log(socket.id)
            socket.on('user login', function (info) {
                const {userId, username} = info;
                //console.log(info)
                self.users[username] = {socketID: socket.id, userId: userId};
                //console.log('login', socket.id)
                //console.log(self.users)
            })

            socket.on('zhang', function (msg) {
                console.log('from zhang: ' + msg);
            })
        }
        //console.log(this.server)
        this.server.on('connection', this.addSocket);
        this.http.listen(133, function(){
            console.log('listening on *:133');
        });
    }

    reciver(topic='zhang'){
        //console.log(self.users)
        this.server.on(topic, (msg) => {
            console.log('message: ' + msg);
        })
    }

    /*添加用户*/
    addUser( {userId, socketID}){
        this.users.push({userId,socketID});
    }
    sendMessage(topic= 'to all', msg){
        this.server.emit(topic, dataBuffer);
    }

    sendToUser(username = 'client', msg){
        console.log(this.users)
        //let encoded = this.server.sockets.to(this.users[username].socketID).customEncode('to one', msg);
        let wsPacket = this.server.sockets.to(this.users[username].socketID).wsEncode('to one', dataBuffer);
        setTimeout(() => {console.log('self', this.server.sockets.to(this.users[username].socketID).wsPacket)}, 5);
        setTimeout(() =>{this.server.sockets.to(this.users[username].socketID).wsEmit(this.server.sockets.to(this.users[username].socketID).wsPacket)}, 3);
        // console.log('wsPacket', wsPacket);
        // let eioPacket = this.server.sockets.to(this.users[username].socketID).customEncode('to one', msg);
        // this.server.sockets.to(this.users[username].socketID).emit('to one', msg)
        // this.server.sockets.to(this.users[username].socketID).eioEmit(eioPacket);
    }
}

let readline = require('readline');
let rl = readline.createInterface({
    input:process.stdin,
    output:process.stdout,
});

let server = new Server(133);

rl.on('line', function (line) {
    let strArr = line.split(':')

    if(strArr.length === 2){    //如果有两个参数，则认为server需要与特点的client通信
        server.sendToUser(strArr[0], strArr[1]);
    }else if(strArr.length === 1){  //如果只有一个参数，默认广播
        server.sendMessage('to all', strArr[0]);
    }else{
        //do nothing
    }
});

server.reciver('zhang')

// let fileStream = fs.createReadStream('big.JPG', optations);
// //fileStream.pause()
// let dataBuffer = new Array();
// fileStream.on('open', function (msg) {
//     log('open sucess');
// });
//
// fileStream.on('data', function (data) {
//     log('read data');
//     //log(data)
//     dataBuffer.push(data);
// });
//
// fileStream.on('error', function (err) {
//     if(err){
//         throw err;
//     }
// });
//
// fileStream.on('close', function () {
// });
//
//     log('file closed');
// fileStream.on('end', function () {
//     log('end')
// })

let dataBuffer = new Array();
for(let i=0; i< 2000; i++){
    dataBuffer.push(i)
}
log(dataBuffer.length)
log(dataBuffer)