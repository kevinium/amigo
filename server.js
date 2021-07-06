
const express = require('express');
const app = express();

const {Pool} = require('pg');
const port = process.env.PORT || 3030;
const server = require('http').Server(app);//createServer(app)
const io = require('socket.io')(server);
// const { ExpressPeerServer } = require('peer');
// const peerServer = ExpressPeerServer(server, {
// 	debug: true
// });
const { v4: uuidV4 } = require('uuid');
const dotenvConf = require('dotenv').config();
const { auth, requiresAuth } = require('express-openid-connect');
app.use( 
	auth({
		authRequired: false,
		auth0Logout: true,
		issuerBaseURL: process.env.ISSUER_BASE_URL,
		baseURL: process.env.BASE_URL,
		clientID: process.env.CLIENT_ID,
		secret: process.env.SECRET,
	})
);
const pool = new Pool({
 connectionString: "postgres://vhrmfyhfwcxfqc:d3b674abb254602eccfda2311d661bc43c5f752b2db26022aff071ac43a6fa82@ec2-52-5-247-46.compute-1.amazonaws.com:5432/daqr3jm2ndi8vi",
 ssl: {
 rejectUnauthorized: false
 }
});


app.set('view engine', 'ejs');

app.use(express.static('public'));

app.get('/', (req,res) => {
	
	if(req.oidc.isAuthenticated()){
		
		res.redirect('home');
	}
	else{
		res.render('loggedOut');
	}
});
app.get('/home', requiresAuth(), (req, res) =>{
	var d = "DELETE FROM meetings WHERE start < NOW();";
	pool.query(d, (err, result) => {
    if (err) {
        console.log("Error - Failed to select all from meetings");
        console.log(err);
    }
    
	});
	var q = "SELECT * FROM meetings WHERE email= '" + req.oidc.user.email + "' ORDER BY start ASC;";
	
	pool.query(q, (err, result) => {
    if (err) {
        console.log("Error - Failed to select all from meetings");
        console.log(err);
    }
    else{
        
        res.render('home', {
				user: req.oidc.user,

				schedList: result.rows,
			});
        
    }
	});
	
});
app.get('/schedule', requiresAuth(), (req, res) =>{
	res.render('schedule', {
		user: req.oidc.user,
	});
});
app.get('/profile', requiresAuth(), (req, res) => {
	res.send(JSON.stringify(req.oidc.user));
});
app.get('/newRoom', requiresAuth(), (req, res) =>{
	res.redirect(`/${uuidV4()}`);

});
app.get('/:room', requiresAuth(), (req, res) => {
  res.render('room', { 
  	roomId: req.params.room,
  	user: req.oidc.user, 
  	userUID: `${uuidV4()}`,
  });
});

io.on('connection', socket => {
	socket.on('join-room', (userId, userName, roomId) => {
		// console.log(userId, "came")
		socket.join(roomId);
		//room created/joined
		//only to sender
		socket.emit('welcome');




		//to all apart from sender
		socket.on('start_call',() => {
			socket.broadcast.to(roomId).emit('start_call', userId, userName);
		});
		socket.on('webrtc_ice_candidate', (dest, event) => {
			socket.broadcast.to(roomId).emit('webrtc_ice_candidate', dest, userId, event);

		});
		socket.on('webrtc_offer', (dest, event) => {
			socket.broadcast.to(roomId).emit('webrtc_offer', dest, userId, userName,event.sdp);
		});
		socket.on('webrtc_answer', (dest, event) => {
			socket.broadcast.to(roomId).emit('webrtc_answer', dest, userId, userName,event.sdp);
		});


		socket.on('message', (msg, USER) =>{
			// console.log(JSON.stringify(USER));
			io.to(roomId).emit('createMessage', msg, USER, userId);
		});
		socket.on('raiseHand', () => {
			socket.broadcast.to(roomId).emit('raiseHand', userId);
		}); 
		socket.on('lowerHand', () => {
			socket.broadcast.to(roomId).emit('lowerHand', userId);
		}); 
		socket.on('disconnect', () => {
			socket.broadcast.to(roomId).emit('user-disconnected', userId);
		});
		socket.on('blur', () => {
			socket.broadcast.to(roomId).emit('blur', userId);
		});
		socket.on('unBlur', () => {
			socket.broadcast.to(roomId).emit('unBlur', userId);
		});
		// socket.on('adding', streamID =>{
		// 	userID_to_streamID[userId] = streamID;
		// });

	});

	socket.on('delTask', (str, email) => {
		var q = "DELETE FROM meetings WHERE email= '" + email + "' AND meetingid= '" + str + "' ;";
	
		pool.query(q, (err, result) => {
		    if (err) {
		        console.log("Error - Failed to Delete");
		        console.log(err);
		    }
		});

	});
	socket.on('needUUID', () => {
		socket.emit('takeUUID', `${uuidV4()}`);
	});
	socket.on('addToMeetings', str => {
		// console.log("q  ", str)
		pool.query(str, (err, result) => {
		    if (err) {
		        console.log("Error - Failed to add");
		        console.log(err);
		    }
		    else{
		    	// console.log(str);
		    }
		});
	});
});





server.listen(process.env.PORT||3030);