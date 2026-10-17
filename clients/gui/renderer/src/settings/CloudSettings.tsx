import { useEffect, useState } from "react";
import type { Action } from "../services.js";
import { Button } from "../components/ui/button.js";

export function CloudSettings({ action }: { action: Action }) {
    const [baseURL, setBaseURL] = useState("");
    const [token, setToken] = useState("");
    const [configured, setConfigured] = useState(false);
    const [busy, setBusy] = useState(true);
    const [message, setMessage] = useState("");
    useEffect(() => {
        let active = true;
        void action("cloud", { operation: "status" })
            .then((value) => {
                if (!active) return;
                setBaseURL(value.baseURL);
                setConfigured(value.tokenConfigured);
            })
            .catch((error) => {
                if (active) setMessage(error.message);
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [action]);
    const save = async () => {
        setBusy(true);
        setMessage("");
        try {
            const value = await action("cloud", {
                operation: "save",
                baseURL,
                ...(token ? { token } : {}),
            });
            setBaseURL(value.baseURL);
            setConfigured(value.tokenConfigured);
            setToken("");
            setMessage("Cloud 配置已保存。");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "保存失败");
        } finally {
            setBusy(false);
        }
    };
    return (
        <form
            className="settings-sections"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <p>配置远程执行后端，在项目会话中选择 Cloud 使用。Harness 暂由后端默认配置决定。</p>
            <label>
                后端 API 地址
                <input
                    aria-label="Cloud 后端地址"
                    type="url"
                    value={baseURL}
                    disabled={busy}
                    placeholder="https://backend.example/openapi/v1"
                    onChange={(event) => setBaseURL(event.target.value)}
                    required
                />
            </label>
            <label>
                Token
                <input
                    aria-label="Cloud token"
                    type="password"
                    autoComplete="off"
                    value={token}
                    disabled={busy}
                    placeholder={configured ? "已保存；留空保留当前 token" : "输入 token"}
                    onChange={(event) => setToken(event.target.value)}
                />
            </label>
            <p>Token 使用系统安全存储加密后保存在本机，不会同步到远程项目。</p>
            <Button type="submit" disabled={busy || !baseURL.trim()}>
                {busy ? "处理中…" : "保存"}
            </Button>
            {message && <p role="status">{message}</p>}
        </form>
    );
}
