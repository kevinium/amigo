//global variables
const express = require('express');
const app = express();

const {Pool} = require('pg');
const port = process.env.PORT || 3030;
const server = require('http').Server(app);//createServer(app)
const io = require('socket.io')(server);
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
 connectionString: "##",
 ssl: {
 rejectUnauthorized: false
 }
});


app.set('view engine', 'ejs');

app.use(express.static('public'));
//base url sent to home page
app.get('/', (req,res) => {
	
	if(req.oidc.isAuthenticated()){
		
		res.redirect('home');
	}
	else{
		res.render('loggedOut');
	}
});
//render home page
app.get('/home', requiresAuth(), (req, res) =>{
	//delete from database all the old meetings
	var d = "DELETE FROM meetings WHERE start < NOW();";
	pool.query(d, (err, result) => {
    if (err) {
        console.log("Error - Failed to select all from meetings");
        console.log(err);

    }
    
	});
	//fetch from database user's meetings
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
//renders new Team page
app.get('/newTeam', requiresAuth(), (req, res) => {
	res.render('team', {
		user: req.oidc.user,
	});
});
//renders schedule meeting page
app.get('/schedule/:room', requiresAuth(), (req, res) =>{
	//fetches from database all email addresses belonging to this group
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
//renders a new meeting room with a random id
app.get('/newRoom', requiresAuth(), (req, res) =>{
	res.redirect(`/${uuidV4()}`);

});
//renders chatroom for a particular room/meeting id/ group id
app.get('/chat/:room', requiresAuth(), (req, res) => {
	//fetches the members emails, and group name from database using group id
	var q = "SELECT email, group_name FROM groups WHERE meetingid='" + req.params.room + "';";
	pool.query(q, (err, result) => {
		if(err){
			console.log("Error - Failed to get group Members");
			console.log(err);
			res.render('error');
		}
		else{
			//fetches previous messages and senders information from database based on group id
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
//renders the meeting room page
app.get('/:room', requiresAuth(), (req, res) => {
	//authenticates valid uuid via a query
	var q = "SELECT * FROM chats WHERE meetingid='" + req.params.room + "';";
	pool.query(q, (err,result)=>{
		if(err){
			console.log("Error- invalid room format");
			res.render('error');
			console.log(err);
			
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
/*
socket callback
trigger
	connection
function
	initiates a socket connection when a new user connects to the server
parameters
	socket - socket object
returns
	null
*/
io.on('connection', socket => {
	/*
	socket callback
	trigger
		join-room
	function
		connects user to a room
	parameters
		userId - user id of connected user
		userName - user name of connected user
		roomId - room id to connect to
	returns
		null
	*/
	socket.on('join-room', (userId, userName, roomId) => {
		
		socket.join(roomId);
		//acknowledgement
		socket.emit('welcome');




		//to all apart from sender
		//relaying broadcasts - every message recieved is relayed to other users
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
		//chat-message to be broadcasted
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
					// res.render('error');
				}
			});


		});
		//to all apart from sender
		//relaying broadcasts - every message recieved is relayed to other users
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

	});
	/*
	socket trigger
	trigger
		delGroup
	function
		execute DBMS query to remove user from group
	parameter
		str - meeting id to be removed from
		email - email of user to remove
	*/
	socket.on('delGroup', (str,	 email) => {
		
		var q = "DELETE FROM groups WHERE email= '" + email +  "' AND meetingid= '" + str + "' ;";
	
		pool.query(q, (err, result) => {
		    if (err) {
		        console.log("Error - Failed to Delete");
		        console.log(err);
		        // res.render('error');
		    }
		});

	});
	/*
	socket trigger
	trigger
		needUUID
	function
		send uuid generated
	parameters
		none
	returns
		none
	*/
	socket.on('needUUID', () => {
		socket.emit('takeUUID', `${uuidV4()}`);
	});
	/*
	socket callback
	trigger
		addToMeetings
	function
		execute query to add schedule a meeting by a user
	parameters
		query to be executed
	returns
		null
	*/
	socket.on('addToMeetings', str => {
		// console.log("q  ", str)
		pool.query(str, (err, result) => {
		    if (err) {
		        console.log("Error - Failed to add");
		        console.log(err);
		    }
		    else{
		    	// res.render('error');
		    }
		});
	});
});





server.listen(process.env.PORT||3030);
