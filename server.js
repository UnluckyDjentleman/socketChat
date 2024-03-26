const express=require('express');
const jwt=require('jsonwebtoken');
const users=require('./accounts.json')||[];
const fs=require('fs');const redis=require('redis');
const cookieParser=require('cookie-parser');
const { render } = require('ejs');
const app=express();
const http=require("http").createServer(app);
const io=require("socket.io")(http);

http.listen(3000, () => {
    console.log("Server Is Running Port: " + 3000);
});

app.engine('html', require('ejs').renderFile);
app.use(cookieParser('cookie_key'))
app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(express.static(__dirname+'/static'))
app.use((req,res,next)=>{
    if(req.cookies.accessToken){
        jwt.verify(req.cookies.accessToken,'access_token',(err, payload)=>{
            if(err) next();
            else if(payload){
                req.payload=payload
                next();
            }
        })
    }
    else next();
})
//===REDIS===
const clientRedis=new redis.createClient({url: "redis://localhost:6379"});
clientRedis.on('connect', ()=>{
    console.log('Redis is working');
})
clientRedis.on('error',(e)=>{
    console.log(e.message);
})
clientRedis.on('end',()=>{
    console.log('Redis ended its work')
})
clientRedis.connect();
//===WEB-TOKEN===
generateAccessToken=(candidate)=>{
    return jwt.sign(
        {id: candidate.id, username: candidate.username},
        'access_token',
        {expiresIn: '600s'}
    );
}
generateRefreshToken=(candidate)=>{
    return jwt.sign(
        {id: candidate.id, username: candidate.username},
        'refresh_token',
        {expiresIn:'86400s'}
    );
}

app.get('/',(req,res)=>{
    res.redirect('/login');
})

app.get('/login',(req,res)=>{
    res.sendFile(__dirname+'/static/login.html');
});

app.post('/login',(req,res)=>{
    const candidate=users.find(e=>e.username===req.body.username&&e.password===req.body.password);
    console.log(candidate);
    if(candidate){
        const accessToken=generateAccessToken(candidate);
        const refreshToken=generateRefreshToken(candidate);
        res.cookie('accessToken',accessToken,{
            httpOnly: true,
            sameSite: 'strict'
        })
        res.cookie('refreshToken',refreshToken,{
            httpOnly: true,
            sameSite: 'strict'
        })
        res.cookie('refreshToken',refreshToken,{
            httpOnly: true,
            sameSite: 'strict',
            path:'/refresh-token'
        })
        res.redirect('/chat/'+candidate.id.toString())
    }
    else{
        res.redirect('/login')
    }
})

app.get('/refresh-token', async (req,res)=>{
    if(req.cookies.refreshToken){
        let isTokenExist=await clientRedis.get(req.cookies.refreshToken);
        if(isTokenExist===null){
            jwt.verify(req.cookies.refreshToken,'refresh_token',async(err, payload)=>{
                if(err) res.send(err.message);
                else if(payload){
                    const candidate=users.find(e=>e.id===payload.id);
                    const accessToken=generateAccessToken(candidate);
                    const refreshToken=generateRefreshToken(candidate);
                    res.cookie('accessToken',accessToken,{
                        httpOnly: true,
                        sameSite: strict
                    })
                    res.cookie('refreshToken',refreshToken,{
                        httpOnly: true,
                        sameSite: strict
                    })
                    res.cookie('refreshToken',refreshToken,{
                        httpOnly: true,
                        sameSite: strict,
                        path:'/refresh-token'
                    })
                    res.redirect('/chat/'+candidate.id.toString())
                }
                res.status(401).send('<h2>ERROR 401:Invalid Token</h2>');
            })
        }
        else{
            return res.status(401).send('<h2>ERROR 401:Unathorized Access</h2>')
        }
    }
})

app.get('/register',(req,res)=>{
    res.sendFile(__dirname+'/static/register.html');
})

app.post('/register',(req,res)=>{
    addContactMethod(req.body);
    res.redirect('/login');
})

app.get('/chat/:id',(req,res)=>{
    if(!req.payload){
        res.status(401).send('<h2>ERROR 401: Unauthorized Access</h2>')
    }
    res.status(200).render(__dirname+'/static/chat.html',{name:req.payload.username});
})

connections = [];

io.sockets.on("connection", (socket) => {
    connections.push(socket);
    console.log("Client"+connections.findIndex(e=>e===socket)+" is Connected!");
    socket.on('disconnect',()=>{
        connections.splice(connections.indexOf(socket), 1);
        console.log('bye');
    });
    socket.on("typing",(data)=>{
        console.log(data);
        socket.broadcast.emit("typing",{name: data.name})
    })
    socket.on("send mess",(data)=>{
        console.log(data);
        io.sockets.emit("add mess", {mess: data.mess, name: data.name, color: data.color});
    })
});

const save=async()=>{
    try{
        await fs.promises.writeFile('accounts.json', JSON.stringify(users, null, 4));
    }
    catch(e){
        console.log(e);
    }
}

const addContactMethod=async(data)=>{
    var index=parseInt(Math.floor(Math.random()*100))
    while(users.find(elem=>elem.id===parseInt(index))){
        index=parseInt(Math.floor(Math.random()*100));
    }
    try{
        users.push({
            id: index,
            username: data.username,
            password: data.password
        });
        save();
        return users
    }
    catch(e){
        console.log(e.message);
    }
}