import { io } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

const socket = io(SOCKET_URL, {
  withCredentials: true,
  autoConnect: false,  
})

export default socket