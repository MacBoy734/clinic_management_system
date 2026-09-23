import { io } from 'socket.io-client'

const SOCKET_URL =
     process.env.NEXT_PUBLIC_SOCKET_URL ||
     (typeof window !== 'undefined' ? `http://${window.location.hostname}:5000` : 'http://localhost:5000')

const socket = io(SOCKET_URL, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  withCredentials: true,
  autoConnect: false,
})

export default socket