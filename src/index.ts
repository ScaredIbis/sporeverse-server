/* eslint-disable */ // allow dotenv to be used ASAP
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { ethers } from 'ethers';
import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import { json as jsonBodyParser } from 'body-parser';
import { ERC20__factory } from './abi/types/factories/ERC20__factory';
/* eslint-enable */

const ARB_TCR_ADDRESS = '0xa72159fc390f0e3c6d415e658264c7c4051e9b87';
const MAINNET_TCR_ADDRESS = '0x9c4a4204b79dd291d6b6571c5be8bbcd0622f050';
const TOKEMAK_TCR_ADDRESS = '0x15A629f0665A3Eb97D7aE9A7ce7ABF73AeB79415';

const arbTCR = ERC20__factory.connect(ARB_TCR_ADDRESS, ethers.getDefaultProvider(process.env.ARBITRUM_RPC_URL));
const mainnetTCR = ERC20__factory.connect(MAINNET_TCR_ADDRESS, ethers.getDefaultProvider(process.env.MAINNET_RPC_URL));
const tokemakTCR = ERC20__factory.connect(TOKEMAK_TCR_ADDRESS, ethers.getDefaultProvider(process.env.MAINNET_RPC_URL));

type Player = {
  x: number,
  y: number,
  address: string,
  avatar: string,
  label: string,
  messages: []
}

type Room = {
  background: string,
  name: string,
  check?: (key: string) => Promise<Boolean>,
  players: Record<string, Player>
}

const knownPlayerData: Record<string, { label?: string, avatar?: string }> = {};

const hasTCR = async (address: string): Promise<boolean> => {
  try {
    const [
      arbBalance,
      mainnetBalance,
      tokemakBalance
    ] = await Promise.all([
      arbTCR.balanceOf(address),
      mainnetTCR.balanceOf(address),
      tokemakTCR.balanceOf(address)
    ]);

    console.log('ARB BALANCE', arbBalance.toString());
    console.log('MAINNET BALANCE', mainnetBalance.toString());

    return !arbBalance.eq(0) || !mainnetBalance.eq(0) || !tokemakBalance.eq(0);
  } catch (error) {
    return false;
  }
};

const rooms: Record<string, Room> = {
  public: {
    background: 'https://i.ibb.co/HFj2bKP/Screen-Shot-2021-12-21-at-10-30-43-am-cropped.png',
    name: 'Spore Vilage',
    players: {}
  },
  vip: {
    background: 'https://i.ibb.co/Xbt039t/spore-vip.png',
    name: 'Spore Hall',
    players: {}
  },
  tracer: {
    background: 'https://i.ibb.co/GQBs6cQ/Screen-Shot-2021-12-21-at-10-23-39-am-removebg-preview-1.png',
    name: 'The Sniper Den',
    check: hasTCR,
    players: {}
  }
};

const app = express();
const server = createServer(app);

// lookup from addresses to nonces, used to authenticate users by eth address
const nonces: Record<string, string> = {};

// lookup from keys to addresses, used for persistent sessions
const keys: Record<string, string> = {};

const knownPlayerRooms: Record<string, string> = {};
const knownSocketPlayerAddresses: Record<string, string> = {};

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

io.on('connection', (socket: Socket) => {
  console.log('GOT A CONNECTION', Date.now(), socket.id);

  socket.on('join', async ({ roomName, key }: { roomName: string, key: string }) => {
    const playerAddress = keys[key];
    knownSocketPlayerAddresses[socket.id] = playerAddress;

    if (knownPlayerRooms[playerAddress] === roomName) {
      // already in this room
      return;
    }

    if (rooms[roomName].check) {
      // @ts-ignore
      const allowed = await rooms[roomName]?.check(playerAddress);
      if (!allowed) {
        console.log('USER HAS NO BALANCE');
        return;
      }
    }

    if (knownPlayerRooms[playerAddress]) {
      console.log(`${playerAddress} is leaving room ${knownPlayerRooms[playerAddress]}`);
      socket.leave(knownPlayerRooms[playerAddress]);
      delete rooms[knownPlayerRooms[playerAddress]].players[playerAddress];
      io.to(knownPlayerRooms[playerAddress]).emit('tick', rooms[knownPlayerRooms[playerAddress]]);
    }

    if (playerAddress && !rooms[roomName].players[playerAddress]) {
      rooms[roomName].players[playerAddress] = {
        x: 600,
        y: 500,
        label: '',
        avatar: 'https://i.ibb.co/ykXzG7c/image.png',
        address: playerAddress,
        messages: [],
        ...knownPlayerData[playerAddress]
      };

      knownPlayerRooms[playerAddress] = roomName;
      console.log('PLAYER ', playerAddress, 'JOINING ROOM ', roomName);
      socket.join(roomName);
      io.to(roomName).emit('tick', rooms[roomName]);
    }
  });

  socket.on('move', ({ x, y }: { x: number, y: number }) => {
    const playerAddress = knownSocketPlayerAddresses[socket.id];
    const currentRoom = knownPlayerRooms[playerAddress];

    if (playerAddress && currentRoom) {
      rooms[currentRoom].players[playerAddress].x += x;
      rooms[currentRoom].players[playerAddress].y += y;

      io.to(currentRoom).emit('tick', rooms[currentRoom]);
    }
  });

  socket.on('updateName', (name: string) => {
    const playerAddress = knownSocketPlayerAddresses[socket.id];
    const currentRoom = knownPlayerRooms[playerAddress];
    knownPlayerData[playerAddress] = knownPlayerData[playerAddress] || {};
    knownPlayerData[playerAddress].label = name;

    if (playerAddress && currentRoom) {
      rooms[currentRoom].players[playerAddress].label = name;

      io.to(currentRoom).emit('tick', rooms[currentRoom]);
    }
  });

  socket.on('updateAvatar', (url: string) => {
    const playerAddress = knownSocketPlayerAddresses[socket.id];
    const currentRoom = knownPlayerRooms[playerAddress];

    knownPlayerData[playerAddress] = knownPlayerData[playerAddress] || {};
    knownPlayerData[playerAddress].avatar = url;

    if (playerAddress && currentRoom) {
      rooms[currentRoom].players[playerAddress].avatar = url;

      io.to(currentRoom).emit('tick', rooms[currentRoom]);
    }
  });

  socket.on('sendMessage', (message: string) => {
    const playerAddress = knownSocketPlayerAddresses[socket.id];
    const currentRoom = knownPlayerRooms[playerAddress];

    const playerName = knownPlayerData[playerAddress]?.label;
    if (playerAddress && currentRoom) {
      io.to(currentRoom).emit('message', { message, sender: playerName || playerAddress });
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    const playerAddress = knownSocketPlayerAddresses[socket.id];

    delete knownPlayerRooms[playerAddress];
    for (const roomName in rooms) {
      delete rooms[roomName].players[playerAddress];
    }
    delete knownSocketPlayerAddresses[socket.id];
  });
});

server.listen(3000);
