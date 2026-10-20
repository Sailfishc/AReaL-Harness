import { useEffect, useRef, useState } from "react";
import type { Action } from "../services.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { SettingsSection, SettingsGroupCard, SettingsRow } from "./SettingsPageParts.js";

export function CloudSettings({ action }: { action: Action }) {
    const [baseURL, setBaseURL] = useState("");
    const [token, setToken] = useState("");
    const [configured, setConfigured] = useState(false);
    const [busy, setBusy] = useState(true);
    const [message, setMessage] = useState("");
    const request = useRef(action); request.current = action;
    useEffect(() => {
        let active = true;
        void request.current("cloud", { operation: "status" }).then(value => {
            if (active) { setBaseURL(value.baseURL); setConfigured(value.tokenConfigured); }
        }).catch(error => { if (active) setMessage(error.message); })
        .finally(() => { if (active) setBusy(false); });
        return () => { active = false; };
    }, []);
    const save = async () => {
        setBusy(true); setMessage("");
        try {
            const value = await request.current("cloud", { operation: "save", baseURL, ...(token ? { token } : {}) });
            setBaseURL(value.baseURL); setConfigured(value.tokenConfigured); setToken("");
            window.dispatchEvent(new Event("areal-cloud-config"));
            setMessage("配置已保存；新建 Cloud 会话时连接。");
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
    };
    return <form className="settings-sections" aria-label="Cloud 设置" onSubmit={event => { event.preventDefault(); void save(); }}>
        <SettingsSection title="Cloud 连接" description="保存服务地址与认证信息，新建 Cloud 会话时才连接并启动沙箱。">
            <SettingsGroupCard>
                <SettingsRow label={<label htmlFor="cloud-url">后端地址</label>} description="固定服务地址，无需填写工作区或会话 ID。" controlLayout="wide" control={
                    <Input id="cloud-url" aria-label="Cloud 后端地址" type="text" value={baseURL} disabled={busy} placeholder="https://backend.example/openapi/v1/app-server/" required
                        onChange={event => { setMessage(""); setBaseURL(event.target.value); }}/>}/>
                <SettingsRow label={<label htmlFor="cloud-token">Token</label>} description="在本机安全存储" controlLayout="wide" control={
                    <Input id="cloud-token" aria-label="Cloud token" type="password" autoComplete="off" value={token} disabled={busy}
                        placeholder={configured ? "已保存，留空保留" : "输入 token"} onChange={event => { setMessage(""); setToken(event.target.value); }}/>}/>
            </SettingsGroupCard>
        </SettingsSection>
        <div className="flex items-center justify-end gap-3"><Button type="submit" disabled={busy || !baseURL.trim()}>{busy ? "保存中…" : "保存"}</Button></div>
        {message && <p role="status" className="settings-section-desc">{message}</p>}
    </form>;
}
