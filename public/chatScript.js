myID = USER_UID;
const socket = io('/');
socket.emit('join-room', myID, USER_NAME, ROOM_ID);

let text = $('input');
$('html').keydown((e) => {
	if(e.which == 13 && text.val().length !== 0) {
		socket.emit('message', text.val(), USER_NAME, USER_EMAIL);
		text.val('');
	}
});
socket.on("createMessage", (msg, user, userId) => {
	if (userId==myID) {
		$('.messages').append(`<li class="message_sent"><b>${user}</b><br/>${msg}</li>`);
	}
	else{
		$('.messages').append(`<li class="message_received"><b>${user}</b><br/>${msg}</li>`);
	}
	scrollToBottom();
});
const scrollToBottom = () =>{
	
	let d = $('.main__chat_window');
	d.scrollTop(d.prop("scrollHeight"));
}
scrollToBottom();