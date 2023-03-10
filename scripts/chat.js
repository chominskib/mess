var socket = io();

function isImgUrl(url) {
  return fetch(url, {method: 'HEAD'}).then(res => {
    return res.headers.get('Content-Type').startsWith('image')
  })
}

function signed_user_id(){
	return document.cookie.split('; ').find((row) => row.startsWith('signed_user_id='))?.split('=')[1];
}

function myHandle(){
	return signed_user_id().split(':')[1].split('.')[0];
}

function leadingZero(str, len){
	out = String(str);
	while(out.length < len){
		out = "0" + out;
	}
	return out;
}

function stringDate(time){
	var dateFormat = new Date(parseInt(time));
	return (dateFormat.getFullYear()+
			"-"+leadingZero((dateFormat.getMonth()+1), 2)+
			"-"+leadingZero(dateFormat.getDate(), 2)+
			" "+leadingZero(dateFormat.getHours(), 2)+
			":"+leadingZero(dateFormat.getMinutes(), 2)+
			":"+leadingZero(dateFormat.getSeconds(), 2));
}

var messagesTimes = [];
var cnt = 0;
var cooloff=500;

function clearMessages(time, msg){
	for(var i = Math.max(0, messagesTimes.length-5); i < messagesTimes.length; i++){
		if(-cooloff <= time-messagesTimes[i][0] && time-messagesTimes[i][0] <= cooloff && messagesTimes[i][1] == msg){
			var E = document.getElementById(messagesTimes[i][2]);
			if (E)
				E.remove();
		}
	}
}

async function addMessage(msg, senderHandle, time, isMine, att, att_name, local){
	const newMessage = document.createElement('div');
	newMessage.setAttribute('class', isMine ? 'myMessage' : 'extMessage');
	var id = 'message' + (cnt++);

	newMessage.setAttribute('id', id);

	const dateBox = document.createElement('div');
	dateBox.setAttribute('class', 'date');
	dateBox.appendChild(document.createTextNode(stringDate(time) + " " + senderHandle));
	newMessage.appendChild(dateBox);

	const newMessageContent = document.createTextNode(msg);
	var divI = document.createElement('div');
	divI.setAttribute('class', 'text');
	newMessage.appendChild(divI);
	divI.appendChild(newMessageContent);
	if (att){
		var div = document.createElement('div');
		div.setAttribute('class', 'attachment');
		var link = '/attachments/'+att+'-'+att_name;
		var res = await isImgUrl(link);
		if (res) {
			const frame = document.createElement('img');
			frame.setAttribute('src', link);
			frame.setAttribute('width', 400);
			newMessage.appendChild(div);
			div.appendChild(frame);
		} else {
			const frame = document.createElement('a');
			frame.setAttribute('href', link);
			newMessage.appendChild(div);
			div.appendChild(frame);
			frame.appendChild(document.createTextNode(att_name));
		}
	}

	clearMessages(time, msg)
	if(isMine) messagesTimes.push([time, msg, id]);

	var messageList = document.getElementById('messages');
	messageList.insertBefore(newMessage, null);

	window.scrollBy(0, document.body.scrollHeight);
	return id;
}

var lastUpdate = 0;

async function refresh(){
	//console.log('refreshed at ' + Date.now() + ' lu: ' + lastUpdate);
	var d;
	await function(){ d = Date.now() }();
	await socket.emit('refresh messages', signed_user_id(), receiverHandle, lastUpdate);
	await function(){ lastUpdate = d; }();
}

refresh();
setInterval(refresh, 1000);

var form = document.getElementById('form');
var input = document.getElementById('messagebox');
var attachment = document.getElementById('attachment');
form.addEventListener('submit', async function(e) {
	e.preventDefault();
	if(input.value || attachment.value){
		var msg = '', att = '';
		if (input.value){
			msg = input.value;
		}
		if (attachment.files){
			att = { ...attachment.files};
		}
		await async function(){
			if (!attachment.value)
				socket.emit('chat message', msg, null, '', signed_user_id(), receiverHandle);
			else
				socket.emit('chat message', msg, att[0], att[0].name, signed_user_id(), receiverHandle);

			await function(){ lastUpdate = Date.now(); }();
		}();
		await addMessage(msg, myHandle(), lastUpdate, true, null, null, true);

		input.value = '';
		attachment.value='';
	}
});
socket.on('ack', function(msg, senderHandle, receiverHandle) {
	console.log("message '" + msg + "' to " + receiverHandle + " sent!");
});

socket.on('nak', function(msg, senderHandle, receiverHandle) {
	alert("Something went wrong!");
});


socket.on('msg', function(msg, att, att_name, senderHandle, receiverHandle, time) {
	addMessage(msg, senderHandle, time, false, att, att_name);
});

socket.on('msg from me', function(msg, att, att_name, senderHandle, receiverHandle, time) {
	addMessage(msg, senderHandle, time, true, att, att_name);
});

socket.on("load plenty", async function(messages) {
	for (var i of messages)
		{
		console.log(i.mine);
		await addMessage(i.msg, i.senderHandle, i.time, i.mine, i.att, i.att_name);
		}
});
