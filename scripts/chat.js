var socket = io();

function signed_user_id(){
	return document.cookie.split('; ').find((row) => row.startsWith('signed_user_id='))?.split('=')[1];
}

function myHandle(){
	return signed_user_id().split(':')[1].split('.')[0];
}

var tempMessages = [];
var cnt = 0;

function addMessage(msg, senderHandle, time, isMine){
	const newMessage = document.createElement('div');
	newMessage.setAttribute('class', isMine ? 'myMessage' : 'extMessage');
	
	var id = 'message' + (cnt++);
	newMessage.setAttribute('id', id);
	const newMessageContent = document.createTextNode(senderHandle + " at " + time + ": " + msg);

	newMessage.appendChild(newMessageContent);

	var messageList = document.getElementById('messages');
	messageList.insertBefore(newMessage, null);
	
	window.scrollBy(0, document.body.scrollHeight);
	return id;
}

function addTempMessage(msg, senderHandle, time, isMine){
	tempMessages.push(addMessage(msg, senderHandle, time, isMine));
}

var lastUpdate = 0;

function refresh(){
	socket.emit('refresh messages', signed_user_id(), receiverHandle, lastUpdate);
	lastUpdate = Date.now();
}

refresh();
setInterval(refresh, 1000);

var form = document.getElementById('form');
var input = document.getElementById('messagebox');

form.addEventListener('submit', async function(e) {
		e.preventDefault();
		if(input.value){
		var msg = input.value;
		input.value = '';
		socket.emit('chat message', msg, signed_user_id(), receiverHandle);
		await refresh();
		refresh().then(
			await addTempMessage(msg, myHandle(), Date.now(), true)).then(
			lastUpdate = Date.now());
		}
});

socket.on('ack', function(msg, senderHandle, receiverHandle) {
	console.log("message '" + msg + "' to " + receiverHandle + " sent!");
});

socket.on('nak', function(msg, senderHandle, receiverHandle) {
	alert("Something went wrong!");
});


socket.on('msg', function(msg, senderHandle, receiverHandle, time) {
	addMessage(msg, senderHandle, time, false);
});

socket.on('msg from me', function(msg, senderHandle, receiverHandle, time) {
	addMessage(msg, senderHandle, time, true);
});
