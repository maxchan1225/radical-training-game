import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// 預設的 Firebase 專案配置 (來自本機專案 teachingtest-49f7a)
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBElQCJTn7DREGG9e_fw8J0RneEqxjHS1o",
  authDomain: "teachingtest-49f7a.firebaseapp.com",
  projectId: "teachingtest-49f7a",
  storageBucket: "teachingtest-49f7a.firebasestorage.app",
  messagingSenderId: "354918792935",
  appId: "1:354918792935:web:2e74c8744f3bf7c544ec42",
  measurementId: "G-RB0JM19G6W"
};

// 嘗試解析網址中的 Base64 憑證動態注入 (格式為 ?fb=base64_config)
let activeConfig = defaultFirebaseConfig;

try {
  const urlParams = new URLSearchParams(window.location.search);
  const fbParam = urlParams.get("fb");
  if (fbParam) {
    const decodedConfig = JSON.parse(atob(fbParam));
    if (decodedConfig && decodedConfig.apiKey && decodedConfig.projectId) {
      activeConfig = decodedConfig;
      console.log("成功解析並注入動態 Firebase 配置：", decodedConfig.projectId);
    }
  }
} catch (e) {
  console.error("解析 URL 中的 Firebase 動態憑證時出錯，將使用預設凭证：", e);
}

// 初始化 Firebase App
const app = getApps().length === 0 ? initializeApp(activeConfig) : getApp();

// 取得服務實例
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth, signInAnonymously, activeConfig };
