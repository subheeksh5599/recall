import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";
import App from "./App.jsx";

document.documentElement.classList.add("js");
createRoot(document.getElementById("root")).render(<App />);
