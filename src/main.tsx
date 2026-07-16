import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initStore } from './store'
import './styles.css'

initStore()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
