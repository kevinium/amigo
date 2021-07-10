
//global variables
var otherPeers = {}
var isBlur = {}
const iceServers = {
  iceServers: [ 
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'turn:numb.viagenie.ca',
			credential: 'qwerty123',
			username: 'kevinengage123@gmail.com'
		}
  ],
}
const socket = io('/');
const videoGrid = document.getElementById('video-grid');
var myVideoStream;
const myVideo = document.createElement('video');
myVideo.muted = true;
var myID = USER_UID;
/*
socket trigger
function
	notifies the server that a node requets to join a room
metadata
	myID - id of the user that requests to join
	USER_NAME - name of the user that requests to join
	ROOM_ID - room/meeting id that the user requests to join
*/
socket.emit('join-room', myID, USER_NAME, ROOM_ID);

/*
socket callback
trigger
	welcome
function
	calls to set local stream
	emits 'start_call'
parameters
	none

*/
socket.on('welcome', async () => {
	// console.log("I, ", myID, " am welcomed");
	await setLocalStream();
	/*
	socket trigger
		function
			notifies the server to initiate a connection/call with others in the room/meeting
		metadata
			none
	*/
	socket.emit('start_call');//useful when others are in call;
});
/*
socket callback
trigger
	start_call
function
	initiates a call with a new user
parameters
	userId - user id of the new user to connect to
	userName - user name of the new user to connect to
*/
socket.on('start_call', async(userId, userName) => {
	otherPeers[userId] = new RTCPeerConnection(iceServers);
	myVideoStream.getTracks().forEach((track) => {//add tracks
		otherPeers[userId].addTrack(track, myVideoStream);
	})

	otherPeers[userId].ontrack = function(event){//set remote stream
		if(document.getElementById(userId)){
				document.getElementById(userId).remove();

		}
		var vid = document.createElement('video');
		vid.srcObject = event.streams[0];
		vid.setAttribute('id', userId+"_vid");
		vid.addEventListener('loadedmetadata', () => {
			vid.play();
			
		});
		vid.setAttribute('width', '400px');
		vid.setAttribute('height', '300px');
		var vidCont = document.createElement('div');
		vidCont.setAttribute('id', userId);
		vidCont.setAttribute('class', 'videoContainer');


		var canv = document.createElement('canvas');
		canv.hidden = true;
		canv.id = userId+"_canv";
		isBlur[canv.id] = false;


		vidCont.appendChild(vid);
		vidCont.appendChild(canv);
		vidCont.appendChild(makeLabel(userName));
		
		videoGrid.appendChild(vidCont);

	}
	otherPeers[userId].onicecandidate = function(event) {//send ice candidate
		if(event.candidate) {
			/*
			socket trigger
			function
				notify server to initiate webrtc ice candidate transfer
			metadata
				userId - user id of the user to transfer to
				anonymous event - parameters for ice candidate
			*/
			socket.emit('webrtc_ice_candidate', userId, {
				ROOM_ID,
				label: event.candidate.sdpMLineIndex,
				candidate: event.candidate.candidate,
			});
		}
	}
	await createOffer(otherPeers[userId], userId);
})
/*
socket callback
trigger
	webrtc_ice_candidate
function
	to create a new ice candidate
parameters
	dest - user id of the receiver (useful only if dest == myID)
	sender - user id of the user who sends parameters
	event - paramets for RTCIceCandidate
*/ 
socket.on('webrtc_ice_candidate', (dest, sender, event) => {
	if(dest==myID){
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: event.label,
			candidate: event.candidate,
		});
		otherPeers[sender].addIceCandidate(candidate);
	}
});
/*
socket call back
trigger
	webrtc_offer
function
	create a webrtc connection
parameters
	dest - user id of the receiver (useful only if dest == myID)
	sender - user id of the user who sends offer
	senderName - name of the user who sends the offer
	event - webrtc offer parameters

*/
socket.on('webrtc_offer', async (dest, sender, senderName, event) => {
	if(dest==myID){
		otherPeers[sender] = new RTCPeerConnection(iceServers);
		myVideoStream.getTracks().forEach((track) => {
			otherPeers[sender].addTrack(track, myVideoStream);
		});
		otherPeers[sender].ontrack = function(event){//set remote stream
			if(document.getElementById(sender)){
				document.getElementById(sender).remove();
			}
			var vid = document.createElement('video');
			vid.setAttribute('id', sender+"_vid");
			vid.srcObject = event.streams[0];
			vid.addEventListener('loadedmetadata', () => {
				vid.play();
			});
			vid.setAttribute('width', '400px');
			vid.setAttribute('height', '300px');
			var vidCont = document.createElement('div');
			vidCont.setAttribute('id', sender);
			vidCont.setAttribute('class', 'videoContainer');


			var canv = document.createElement('canvas');
			canv.hidden = true;
			canv.id = sender+"_canv";
			isBlur[canv.id] = false;


			vidCont.appendChild(vid);
			vidCont.appendChild(canv);
			vidCont.appendChild(makeLabel(senderName));

			// console.log("webrt_offer", sender);
			videoGrid.appendChild(vidCont);
		}

		otherPeers[sender].onicecandidate = function(event) {//send ice candidate
			if(event.candidate) {
				/*
				socket trigger
				function
					notify server to initiate webrtc ice candidate transfer
				metadata
					userId - user id of the user to transfer to
					anonymous event - parameters for ice candidate
				*/
				socket.emit('webrtc_ice_candidate', sender, {
					ROOM_ID,
					label: event.candidate.sdpMLineIndex,
					candidate: event.candidate.candidate,
				});
			}
		}

		otherPeers[sender].setRemoteDescription(new RTCSessionDescription(event))
		await createAnswer(otherPeers[sender], sender);
	}
})
/*
socket callback
trigger
	webrtc_answer
function
	acknowledge and add the webrtc connection
parameters
	dest - user id of the receiver (useful only if dest == myID)
	sender - user id of the user who sends offer
	senderName - userName of the user who sends the offer
	event - paramenters for RTCSessionDescription
*/
socket.on('webrtc_answer', (dest, sender, senderName, event) => {
	if(dest==myID){
		otherPeers[sender].setRemoteDescription(new RTCSessionDescription(event));
	}
});
/*
function
	sets local stream and creates canvas for blur effect
parameters
	none
returns
	null
*/
async function setLocalStream() {
	let stream;
	try{
		stream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: true
		});
	} catch(error){
		console.error('cant get local media', error);
	}
	myVideoStream = stream;
	myVideo.srcObject = stream;
	myVideo.setAttribute('id', myID+"_vid");
	myVideo.setAttribute('width', '400px');
	myVideo.setAttribute('height', '300px');
	myVideo.addEventListener('loadedmetadata', () => {
		myVideo.play();
	});
	var vidCont = document.createElement('div');
	vidCont.setAttribute('id', myID);
	vidCont.setAttribute('class', 'videoContainer');


	var canv = document.createElement('canvas');
	canv.hidden = true;
	canv.id = myID+"_canv";
	isBlur[canv.id] = false;


	vidCont.appendChild(myVideo);
	vidCont.appendChild(canv);
	vidCont.appendChild(makeLabel(USER_NAME));
	videoGrid.appendChild(vidCont);

}
/*
function
	create a webrtc offer
parameters
	rtcpc - RTC peer connection object
	userId - user id of the user to offer the webrtc offer to
returns
	null
*/
async function createOffer(rtcpc, userId){
	let sessionDescription
	try {
		sessionDescription = await rtcpc.createOffer()
		rtcpc.setLocalDescription(sessionDescription)
	} catch(error){
		console.error(error);
	}

	socket.emit('webrtc_offer', userId, {
		type: 'webrtc_offer',
		sdp: sessionDescription,
		ROOM_ID,
	})
}

/*
function
	creates answer to a webrtc offer recieved
parameters
	rtcpc - RTC peer connection object
	userId - user id of the user to offer the webrtc offer to
returns
	null
*/
async function createAnswer(rtcpc, userId) {
	let sessionDescription
	try {
		sessionDescription = await rtcpc.createAnswer()
		rtcpc.setLocalDescription(sessionDescription)
	} catch(error){
		console.error(error);
	}
	/*
	socket trigger
	function
		notify the server to send a webrtc_answer
	metadata
		userId - user id of the user to send the answer to
		anonymous event - parameters of the answer
	*/
	socket.emit('webrtc_answer', userId, {
		type: 'webrtc_answer',
		sdp: sessionDescription,
		ROOM_ID,
	})
}


var isHandRaised = false;
/*
function
	to remove the stream of disconnected users
parameters
	event - RTC object of the disconnected user
	userId - user id of the disconnected user
returns
	null
*/
function checkPeerDisconnect(event, userId) {
  var state = otherPeers[userId].pc.iceConnectionState;
  // console.log(`connection with peer ${userId} ${state}`);
  if (state === "failed" || state === "closed" || state === "disconnected") {
    delete otherPeers[userId];
    videoGrid.removeChild(document.getElementById(userId));
  }
}
/*
function
	to make label of the user name to add below their stream
parameters
	label - username to be added
returns
	div element containing the text specified as lable
*/

function makeLabel(label) {
  var vidLabel = document.createElement('div');
  vidLabel.appendChild(document.createTextNode(label));
  vidLabel.setAttribute('class', 'videoLabel');
  return vidLabel;
}
/*
function
	prints the error - used for debugging
parameters
	error - error that caused a disrupt
returns
	null
*/
function errorHandle(error) {
  console.log(error);
}
/*
function
	add a video stream to the video element
parameters
	video - video element where the sream needs to be added
	stream - stream that needs to be sent to the video element
returns 
	null
*/
const addVideoStream = (video, stream) => {

	
	video.srcObject = stream;
	video.addEventListener('loadedmetadata', () => {
		video.play();
	});
}
/*
socket callback
trigger
	user-disconnected
function
	removes the video element and label of the disconnected user
*/
socket.on('user-disconnected', userId => {
	
	if(document.getElementById(userId)){
		document.getElementById(userId).remove();
	}
	
	
});
/*
socket callback
trigger
	raiseHand
function
	highlights the video of user with raisedHand
*/
socket.on('raiseHand', userId => {
	
	if(document.getElementById(userId+"_vid")){
		document.getElementById(userId+"_vid").className = "highlighted";
		document.getElementById(userId+"_canv").className = "highlighted";
	}
	
});
/*
socket callback
trigger
	lowerHand
function
	un-highlights the video of user with raisedHand
*/
socket.on('lowerHand', userId => {
	
	if(document.getElementById(userId+"_vid")){
		document.getElementById(userId+"_vid").className = "unHighlighted";
		document.getElementById(userId+"_canv").className = "unHighlighted";
	}
	
});
/*
triggered on pressing ENTER - to send a message to the chat
*/
let text = $('input');
$('html').keydown((e) =>{
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

socket.on("createMessage", (msg, user, userId) =>{
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
/*
function
	toggles mic on/off
parameters
	none
returns
	null
*/
const micToggle = () => {
	const enabled = myVideoStream.getAudioTracks()[0].enabled;
	if(enabled){
		myVideoStream.getAudioTracks()[0].enabled = false;
		setUnmuteButton();
	} else {
		myVideoStream.getAudioTracks()[0].enabled = true;
		setMuteButton();
	}
}
/*
function
	sets the unmute button (GUI element)
parameters
	none
returns
	null
*/
const setUnmuteButton = () => {
	const html = `
		<i class="unmute fas fa-microphone-slash"></i>
		<span>Unmute</span>
	`
	document.querySelector('.main__mute_button').innerHTML = html;
}
/*
function
	sets the mute button (GUI element)
parameters
	none
returns
	null
*/
const setMuteButton = () => {
	const html = `
		<i class="fas fa-microphone"></i>
		<span>Mute</span>
	`
	document.querySelector('.main__mute_button').innerHTML = html;
}
/*
function
	toggles video on/off
parameters
	none
returns
	null
*/
const vidToggle = () => {
	const enabled = myVideoStream.getVideoTracks()[0].enabled;
	if(enabled){
		myVideoStream.getVideoTracks()[0].enabled = false;
		setPlayButton();
	} else {
		myVideoStream.getVideoTracks()[0].enabled = true;
		setStopButton();
	}
}
/*
function
	sets the play button (GUI element)
parameters
	none
returns
	null
*/

const setPlayButton = () => {
	const html = `
		<i class="start fas fa-video-slash"></i>
		<span>Start Video</span>
	`
	document.querySelector('.main__video_button').innerHTML = html;
}
/*
function
	sets the stop button (GUI element)
parameters
	none
returns
	null
*/

const setStopButton = () => {
	const html = `
		<i class="fas fa-video"></i>
		<span>Stop Video</span>
	`
	document.querySelector('.main__video_button').innerHTML = html;
}
/*
function
	raises / lowers the hand of the user on theri own screen and also toggles the gui element
parameters
	none
returns
	null
*/
const raiseHand = () => {
	if(isHandRaised){
		myVideo.className = "unHighlighted";
		document.getElementById(myID+"_canv").className = "unHighlighted";
		socket.emit('lowerHand');
		isHandRaised = false;
		const html = `
			<i class="fas fa-hand-paper"></i>
			<span>Raise Hand</span>
		`
		document.querySelector('.main__raise_hand_button').innerHTML = html;
	}
	else{
		myVideo.className = "highlighted";
		document.getElementById(myID+"_canv").className = "highlighted";
		socket.emit('raiseHand');
		isHandRaised = true;
		const html = `
			<i class="handRaised far fa-hand-paper"></i>
			<span>Lower Hand</span>
		`
		document.querySelector('.main__raise_hand_button').innerHTML = html;
		
	}
}
/*
function
	copies room id to the clipboard
parameters
	none
returns
	null
*/
const copyRoomId = () => {
	const roomTemp = document.createElement('textarea');
	roomTemp.value = ROOM_ID;
	document.body.appendChild(roomTemp);
	roomTemp.select();
	roomTemp.select(0, 99999);
	document.execCommand("copy");
	document.body.removeChild(roomTemp);
	alert("Meeting ID copied "+roomTemp.value);

}
/*
function
	calls blur/unBlur
parameters
	none
returns
	null
*/
const blurToggle = () => {
	if(isBlur[myID+"_canv"]==true){
		socket.emit('unBlur');
		unBlur(myID);
		const html = `
			<span class="material-icons md-24">blur_on</span>
			<span>Blur</span>
		`
		document.querySelector('.main__blur_button').innerHTML = html;
	}
	else{
		socket.emit('blur');
		blur(myID);
		const html = `
			<span class="start material-icons md-24">blur_off</span>
			<span>Un-Blur</span>
		`
		document.querySelector('.main__blur_button').innerHTML = html;
	}
}

/*
socket callbacks
	calls blur / unBlur
*/
socket.on('blur', userId => {
	blur(userId);
})
socket.on('unBlur', userId => {
	unBlur(userId);
})

/*
function
	blurs the video of the user
parameters
	userId - user id of the user to blur
returns
	null
*/
const blur = (userId) => {
	var vid = document.getElementById(userId+"_vid");
	vid.hidden = true;

	var canv = document.getElementById(userId+"_canv");
	canv.hidden = false;
	isBlur[canv.id] = true;
	loadBodyPix(vid, canv);
}
/*
function
	un-blurs the video of the user
parameters
	userId - user id of the user to un-blur
returns
	null
*/
const unBlur = (userId) => {
	var vid = document.getElementById(userId+"_vid");
	vid.hidden = false;
	var canv = document.getElementById(userId+"_canv");
	canv.hidden = true;
	isBlur[canv.id] = false;
}

/*
function
	loads the bodyPix object with parameters
parameters
	vidElement - video element to blur
	canvasElement - canvasElement to draw the blur stream on
returns
	null
*/
const loadBodyPix = (vidElement, canvasElement) => {
	options = {
		multiplier: 0.75,
		stride: 32,
		quantBytes: 4
	}
	bodyPix.load(options)
		.then(net => perform(net, vidElement, canvasElement))
		.catch(err => console.log(err))
}
/*
helper function
	helper to bodyPix , blurs the video based on body segmenttion using AI
parameters
	net - net element used for body segmentation
	vidElement - video element to blur
	canvasElement - canvasElement to draw the blur stream on
returns
	null
*/
async function perform(net, vidElement, canvasElement) {
	while(isBlur[canvasElement.id]==true){
		const segmentation = await net.segmentPerson(vidElement);
		const backgroundBlurAmount = 6;
		const edgeBlurAmount = 2;
		const flipHorizontal = false;
		bodyPix.drawBokehEffect(canvasElement, vidElement, segmentation, backgroundBlurAmount,
			edgeBlurAmount, flipHorizontal);
	}
}
