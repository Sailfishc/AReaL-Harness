import { useEffect, useRef, useState } from "react";
import type { Action } from "../services.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { SettingsSection, SettingsGroupCard, SettingsRow } from "./SettingsPageParts.js";
import "../CloudComposer.css";

type Connection = "idle" | "checking" | "connected" | "failed";
export function CloudSettings({ action }: { action: Action }) {
    const [baseURL, setBaseURL] = useState("");
    const [token, setToken] = useState("");
    const [configured, setConfigured] = useState(false);
    const [busy, setBusy] = useState(true);
    const [message, setMessage] = useState("");
    const [connection, setConnection] = useState<Connection>("idle");
    const request = useRef(action); request.current = action;
    const generation = useRef(0);
    const check = async (version: number) => {
        setConnection("checking");
        try {
            await request.current("cloud", { operation: "check" });
            if (version === generation.current) setConnection("connected");
        } catch (error) {
            if (version === generation.current) { setConnection("failed"); setMessage((error as Error).message); }
        }
    };
    useEffect(() => {
        const version = ++generation.current;
        void request.current("cloud", { operation: "status" }).then(async value => {
            if (version !== generation.current) return;
            setBaseURL(value.baseURL); setConfigured(value.tokenConfigured);
            if (value.baseURL && value.tokenConfigured) await check(version);
        }).catch(error => { if (version === generation.current) setMessage(error.message); })
        .finally(() => { if (version === generation.current) setBusy(false); });
        return () => { generation.current++; };
    }, []);
    const edit = () => { generation.current++; setConnection("idle"); setMessage(""); };
    const save = async () => {
        setBusy(true); setMessage(""); setConnection("idle");
        const version = ++generation.current;
        try {
            const value = await request.current("cloud", { operation: "save", baseURL, ...(token ? { token } : {}) });
            if (version !== generation.current) return;
            setBaseURL(value.baseURL); setConfigured(value.tokenConfigured); setToken("");
            window.dispatchEvent(new Event("areal-cloud-config"));
            await check(version);
        } catch (error) {
            if (version === generation.current) { setConnection("failed"); setMessage((error as Error).message); }
        } finally { if (version === generation.current) setBusy(false); }
    };
    return <form className="settings-sections" aria-label="Cloud 设置" onSubmit={event => { event.preventDefault(); void save(); }}>
        <SettingsSection title="Cloud 连接" description="连接远程后端，在项目会话中选择 Cloud。"
            action={<span className="cloud-connection-status" data-state={connection} role="status"><span className="cloud-connection-dot" aria-hidden="true"/>
                {{ idle: "未验证", checking: "正在连接…", connected: "后端已连接", failed: "连接失败" }[connection]}</span>}>
            <SettingsGroupCard>
                <SettingsRow label={<label htmlFor="cloud-url">后端地址</label>} description="Cloud 服务的 API 地址" controlLayout="wide" control={
                    <Input id="cloud-url" aria-label="Cloud 后端地址" type="url" value={baseURL} disabled={busy} placeholder="https://backend.example/openapi/v1" required
                        onChange={event => { edit(); setBaseURL(event.target.value); }}/>}/>
                <SettingsRow label={<label htmlFor="cloud-token">Token</label>} description="在本机安全存储" controlLayout="wide" control={
                    <Input id="cloud-token" aria-label="Cloud token" type="password" autoComplete="off" value={token} disabled={busy}
                        placeholder={configured ? "已保存，留空保留" : "输入 token"} onChange={event => { edit(); setToken(event.target.value); }}/>}/>
            </SettingsGroupCard>
        </SettingsSection>
        <div className="flex items-center justify-end gap-3"><Button type="submit" disabled={busy || !baseURL.trim()}>{busy ? "连接中…" : "保存并连接"}</Button></div>
        {message && <p role="alert" className="settings-section-desc text-destructive">{message}</p>}
    </form>;
}
