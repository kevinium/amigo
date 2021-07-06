
//frontend
var otherPeers = {}
var isBlur = {}
const iceServers = {
  iceServers: [ //maybe quotes aren't needed
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

socket.emit('join-room', myID, USER_NAME, ROOM_ID);


socket.on('welcome', async () => {
	// console.log("I, ", myID, " am welcomed");
	await setLocalStream();
	socket.emit('start_call');//useful when others are in call;
});

socket.on('start_call', async(userId, userName) => {
	otherPeers[userId] = new RTCPeerConnection(iceServers);
	//addLocal tracks
	myVideoStream.getTracks().forEach((track) => {
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

		// console.log("start_call", userId)
	}
	otherPeers[userId].onicecandidate = function(event) {//send ice candidate
		if(event.candidate) {
			socket.emit('webrtc_ice_candidate', userId, {
				ROOM_ID,
				label: event.candidate.sdpMLineIndex,
				candidate: event.candidate.candidate,
			});
		}
	}
	await createOffer(otherPeers[userId], userId);
})

socket.on('webrtc_ice_candidate', (dest, sender, event) => {
	if(dest==myID){
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: event.label,
			candidate: event.candidate,
		});
		otherPeers[sender].addIceCandidate(candidate);
	}
});

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

socket.on('webrtc_answer', (dest, sender, senderName, event) => {
	if(dest==myID){
		otherPeers[sender].setRemoteDescription(new RTCSessionDescription(event));
	}
});

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


async function createAnswer(rtcpc, userId) {
	let sessionDescription
	try {
		sessionDescription = await rtcpc.createAnswer()
		rtcpc.setLocalDescription(sessionDescription)
	} catch(error){
		console.error(error);
	}

	socket.emit('webrtc_answer', userId, {
		type: 'webrtc_answer',
		sdp: sessionDescription,
		ROOM_ID,
	})
}


var isHandRaised = false;

function checkPeerDisconnect(event, userId) {
  var state = otherPeers[userId].pc.iceConnectionState;
  // console.log(`connection with peer ${userId} ${state}`);
  if (state === "failed" || state === "closed" || state === "disconnected") {
    delete otherPeers[userId];
    videoGrid.removeChild(document.getElementById(userId));
  }
}


function makeLabel(label) {
  var vidLabel = document.createElement('div');
  vidLabel.appendChild(document.createTextNode(label));
  vidLabel.setAttribute('class', 'videoLabel');
  return vidLabel;
}

function errorHandle(error) {
  console.log(error);
}


const addVideoStream = (video, stream) => {

	
	video.srcObject = stream;
	video.addEventListener('loadedmetadata', () => {
		video.play();
	});
	// videoGrid.append(video);
}
socket.on('user-disconnected', userId => {
	// console.log(inMeeting[userId]);
	if(document.getElementById(userId)){
		document.getElementById(userId).remove();
	}
	// if(inMeeting[userId]) inMeeting[userId].close();
	
});
socket.on('raiseHand', userId => {
	
	if(document.getElementById(userId+"_vid")){
		document.getElementById(userId+"_vid").className = "highlighted";
		document.getElementById(userId+"_canv").className = "highlighted";
	}
	
});
socket.on('lowerHand', userId => {
	
	if(document.getElementById(userId+"_vid")){
		document.getElementById(userId+"_vid").className = "unHighlighted";
		document.getElementById(userId+"_canv").className = "unHighlighted";
	}
	
});
let text = $('input');
$('html').keydown((e) =>{
	if(e.which == 13 && text.val().length !== 0) {
		socket.emit('message', text.val(), USER_NAME);
		text.val('');
	}
});
socket.on("createMessage", (msg, user, userId) =>{
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
const setUnmuteButton = () => {
	const html = `
		<i class="unmute fas fa-microphone-slash"></i>
		<span>Unmute</span>
	`
	document.querySelector('.main__mute_button').innerHTML = html;
}
const setMuteButton = () => {
	const html = `
		<i class="fas fa-microphone"></i>
		<span>Mute</span>
	`
	document.querySelector('.main__mute_button').innerHTML = html;
}

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
const setPlayButton = () => {
	const html = `
		<i class="start fas fa-video-slash"></i>
		<span>Start Video</span>
	`
	document.querySelector('.main__video_button').innerHTML = html;
}
const setStopButton = () => {
	const html = `
		<i class="fas fa-video"></i>
		<span>Stop Video</span>
	`
	document.querySelector('.main__video_button').innerHTML = html;
}
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

const blurToggle = () => {
	if(isBlur[myID+"_canv"]==true){
		socket.emit('unBlur');
		unBlur(myID);
	}
	else{
		socket.emit('blur');
		blur(myID);
	}
}

socket.on('blur', userId => {
	blur(userId);
})
socket.on('unBlur', userId => {
	unBlur(userId);
})

const blur = (userId) => {
	var vid = document.getElementById(userId+"_vid");
	vid.hidden = true;

	var canv = document.getElementById(userId+"_canv");
	canv.hidden = false;
	isBlur[canv.id] = true;
	loadBodyPix(vid, canv);
}

const unBlur = (userId) => {
	var vid = document.getElementById(userId+"_vid");
	vid.hidden = false;
	var canv = document.getElementById(userId+"_canv");
	canv.hidden = true;
	isBlur[canv.id] = false;
}


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
