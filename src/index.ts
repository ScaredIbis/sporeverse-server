import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { ethers } from 'ethers';
import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import { json as jsonBodyParser } from 'body-parser';

type Player = {
  x: number,
  y: number,
  address: string,
  avatar: string,
  label: string,
  messages: []
}

const validRoomNames = {
  public: true,
  vip: true
};

type ValidRoomName = keyof typeof validRoomNames

const rooms: Record<string, { check?: (key: string) => Promise<Boolean>, players: Record<string, Player> }> = {
  public: {
    players: {}
  },
  vip: {
    players: {}
  }
};

const players: Record<string, Player> = {};

const isValidRoomName = (roomName: string): roomName is ValidRoomName => {
  return validRoomNames[roomName as ValidRoomName];
};

const app = express();
const server = createServer(app);

// lookup from addresses to nonces, used to authenticate users by eth address
const nonces: Record<string, string> = {};

// lookup from keys to addresses, used for persistent sessions
const keys: Record<string, string> = {};

const knownSocketRooms: Record<string, string> = {};
const knownSocketPlayerAddresses: Record<string, string> = {};

const socketIds: Record<string, Socket> = {};

app.use(cors());
app.use(jsonBodyParser());

app.get('/nonce/:address', async (req, res) => {
  const { address } = req.params;

  const randomBytes = await crypto.randomBytes(24);
  const nonce = randomBytes.toString('hex');

  nonces[address] = nonce;

  return res.send({
    nonce
  });
});

app.post('/login', async (req, res) => {
  const { signature, address } = req.body;

  const nonce = nonces[address];

  const message = `Log into the Sporeverse: ${nonce}`;
  // attach prefix
  const signer = ethers.utils.verifyMessage(message, signature);

  if (signer.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).send({ message: 'signature mismatch' });
  }

  const randomBytes = await crypto.randomBytes(24);
  const key = randomBytes.toString('hex');

  keys[key] = address;

  return res.send({
    key
  });
});

app.get('/keycheck', async (req, res) => {
  const { key } = req.body;

  return res.send({
    address: keys[key]
  });
});

const io = new Server(server, {
  transports: ['polling'],
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// setInterval(() => {
//   io.to('public').emit('tick', rooms.public.players);
//   // io.to('vip').emit('tick', rooms.vip.players);
// }, 100);

io.on('connection', (socket: Socket) => {
  console.log('GOT A CONNECTION', Date.now(), socket.id);

  socket.on('join', ({ roomName, key }: { roomName: string, key: string }) => {
    const playerAddress = keys[key];
    // const playerAddress = '0xE74864C33Be4d8DA148e0e3a21d345Cbe6EC9677'.toLowerCase();
    knownSocketPlayerAddresses[socket.id] = playerAddress;

    if (knownSocketRooms[socket.id]) {
      console.log(`${socket.id} is leaving room ${knownSocketRooms[socket.id]}`);
      socket.leave(knownSocketRooms[socket.id]);
      delete rooms[roomName].players[playerAddress];
    }

    if (playerAddress) {
      rooms[roomName].players[playerAddress] = {
        x: 500,
        y: 150,
        label: 'New Spore',
        avatar: 'https://library.kissclipart.com/20190225/azq/kissclipart-mushroom-clipart-mushroom-6b0c2474587f8dd3.png',
        address: playerAddress,
        messages: []
      };

      knownSocketRooms[socket.id] = roomName;
      console.log('SOCKET ID ', socket.id, 'JOINING ROOM ', roomName);
      socket.join(roomName);
      io.to(roomName).emit('tick', rooms[roomName].players);
    }
  });

  socket.on('move', ({ x, y }: { x: number, y: number }) => {
    const playerAddress = knownSocketPlayerAddresses[socket.id];
    const currentRoom = knownSocketRooms[socket.id];

    rooms[currentRoom].players[playerAddress].x += x;
    rooms[currentRoom].players[playerAddress].y += y;

    io.to(currentRoom).emit('tick', rooms[currentRoom].players);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
  });

  // socket.on('join', async function ({ roomName, key }: { roomName: string, key: string }) {
  //   // const playerAddress = keys[key];
  //   const playerAddress = '0xE74864C33Be4d8DA148e0e3a21d345Cbe6EC9677'.toLowerCase();

  //   if (!playerAddress) {
  //     return;
  //   }

  //   if (!isValidRoomName(roomName)) {
  //     return;
  //   }

  //   if (rooms[roomName] && rooms[roomName].check) {
  //     // @ts-ignore
  //     const isAllowed = rooms[roomName].check ? await rooms[roomName]?.check(key) : true;

  //     if (!isAllowed) {
  //       return;
  //     }
  //   }

  //   // @ts-ignore
  //   const player = players[playerAddress];

  //   if (!player) {
  //     players[playerAddress] = {
  //       x: 150,
  //       y: 150,
  //       label: 'New Spore',
  //       avatar: '',
  //       currentRoom: roomName,
  //       address: playerAddress
  //     };
  //   } else {
  //     delete rooms[player.currentRoom].players[playerAddress];
  //     socket.leave(player.currentRoom);
  //   }

  //   players[playerAddress].currentRoom = roomName;

  //   rooms[roomName].players[playerAddress] = {
  //     ...players[playerAddress],
  //     messages: []
  //   };
  //   socket.join(roomName);

  //   io.to(roomName).emit('newPlayer', players[playerAddress]);
  // });
});

server.listen(3000);
