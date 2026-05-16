import { io } from "socket.io-client";

// Ensure socket connects to the correct origin and path
export const socket = io(window.location.origin, {
  path: "/socket.io",
  autoConnect: true,
});
