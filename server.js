
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
	        res.render('error');
	    }
	    else{
	    	var group_query = "SELECT meetingid, group_name FROM groups WHERE email='" + req.oidc.user.email + "';";
			pool.query(group_query, (err, g_result) =>{
				if(err) {
					console.log("Error - Failed to select groups");
					console.log(err);
					res.render('error');
				}
				else{
					res.render('home', {
						user: req.oidc.user,
						groups: g_result.rows,
						schedList: result.rows,
					});
				}
			});
	    }
	});
	
});
app.get('/newTeam', requiresAuth(), (req, res) => {
	res.render('team', {
		user: req.oidc.user,
	});
});
app.get('/schedule/:room', requiresAuth(), (req, res) =>{
	var q = "SELECT email FROM groups WHERE meetingid='" + req.params.room + "';";
	pool.query(q, (err, result) => {
		if(err){
			console.log("Error - Failed to get group emails");
			console.log(err);
			res.render('error');
		}
		else{
			res.render('schedule', {
				user: req.oidc.user,
				members: result.rows,
				roomId: req.params.room,
			});
		}
	});
});
app.get('/newRoom', requiresAuth(), (req, res) =>{
	res.redirect(`/${uuidV4()}`);

});
app.get('/chat/:room', requiresAuth(), (req, res) => {
	var q = "SELECT email, group_name FROM groups WHERE meetingid='" + req.params.room + "';";
	pool.query(q, (err, result) => {
		if(err){
			console.log("Error - Failed to get group Members");
			console.log(err);
			res.render('error');
		}
		else{
			var mq = "SELECT email, name, message, time FROM chats WHERE meetingid='" + req.params.room + "' ORDER BY time ASC;";
			pool.query(mq, (err, m_result) => {
				if(err){
					console.log("Error - Failed to get messages");
					console.log(err);
					res.render('error');
				}
				else{
					res.render('chatRoom', {
						roomId: req.params.room,
						user: req.oidc.user,
						userUID: `${uuidV4()}`,
						members: result.rows,
						messages: m_result.rows,
					});
				}
			})
			
		}
	})
	
});

app.get('/:room', requiresAuth(), (req, res) => {
	var q = "SELECT * FROM chats WHERE meetingid='" + req.params.room + "';";
	pool.query(q, (err,result)=>{
		if(err){
			console.log("Error- invalid room format");
			console.log(err);
			res.render('error');
		}
		else{
			res.render('room', { 
		  	roomId: req.params.room,
		  	user: req.oidc.user, 
		  	userUID: `${uuidV4()}`,
		  });
		}
	})
  
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


		socket.on('message', (msg, USER, email) =>{
			// console.log(JSON.stringify(USER));
			io.to(roomId).emit('createMessage', msg, USER, userId);
			var q = "INSERT into chats (email, name, meetingid, message, time) VALUES ('" + 
			email + "', '" +
			USER + "', '" +
			roomId + "', '" +
			msg + "', now());";
			pool.query(q, (err, result) => {
				if(err){
					console.log(err);
				}
			});


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

	socket.on('delGroup', (str,	 email) => {
		
		var q = "DELETE FROM groups WHERE email= '" + email +  "' AND meetingid= '" + str + "' ;";
	
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