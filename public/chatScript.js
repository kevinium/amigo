myID = USER_UID;
const socket = io('/');
socket.emit('join-room', myID, USER_NAME, ROOM_ID);
// to send a text message
// triggered when user presses ENTER
let text = $('input');
$('html').keydown((e) => {
	if(e.which == 13 && text.val().length !== 0) {
		socket.emit('message', text.val(), USER_NAME, USER_EMAIL);
		text.val('');
	}
});
/*
Socket callback
trigger
	createMessage
function
	appends a message to the screen
parameters 
	msg - message recieved
	user - username of the sender
	userid - uuid of the sender
returns 
	null
*/

socket.on("createMessage", (msg, user, userId) => {
	if (userId==myID) {
		$('.messages').append(`<li class="message_sent"><b>${user}</b><br/>${msg}</li>`);
	}
	else{
		$('.messages').append(`<li class="message_received"><b>${user}</b><br/>${msg}</li>`);
	}
	scrollToBottom();
});
/*
Scrolls to the bottom of the chat window
parameters
	none
returns
	none
*/
const scrollToBottom = () =>{
	
	let d = $('.main__chat_window');
	d.scrollTop(d.prop("scrollHeight"));
}
scrollToBottom();