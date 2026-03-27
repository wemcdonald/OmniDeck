import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { api, type InstallResult } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";

interface PluginZipTabProps {
  onClose: () => void;
}

export function PluginZipTab({ onClose }: PluginZipTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleInstall(overwrite = false) {
    if (!file) return;
    setInstalling(true);
    try {
      const installResult = await api.plugins.installFromZip(file, overwrite);
      setResult(installResult);
    } catch (err) {
      setResult({
        status: "error",
        errors: [(err as Error).message],
      });
    } finally {
      setInstalling(false);
    }
  }

  function handleFile(f: File) {
    if (f.size > 5 * 1024 * 1024) {
      setResult({ status: "error", errors: ["File too large (max 5MB)"] });
      return;
    }
    setFile(f);
    setResult(null);
  }

  // Success
  if (result?.status === "installed") {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm font-medium">
          Plugin &ldquo;{result.plugin?.name}&rdquo; installed!
        </p>
        <p className="text-sm text-muted-foreground">
          Restart the hub to activate.
        </p>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  // Conflict
  if (result?.status === "conflict") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p>
            <span className="font-medium">Already installed:</span> v{result.installed?.version}
          </p>
          <p>
            <span className="font-medium">New version:</span> v{result.incoming?.version}
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => handleInstall(true)} disabled={installing}>
            {installing ? "Installing..." : "Overwrite"}
          </Button>
        </div>
      </div>
    );
  }

  // Error
  if (result?.status === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-destructive">Installation failed</p>
        <ul className="text-sm text-muted-foreground list-disc pl-4">
          {result.errors?.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
        <Button
          variant="outline"
          onClick={() => {
            setResult(null);
            setFile(null);
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-outline-variant hover:border-muted-foreground/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {file ? file.name : "Drop a .zip file here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Max 5MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {file && (
        <Button onClick={() => handleInstall()} disabled={installing}>
          {installing ? "Installing..." : "Install Plugin"}
        </Button>
      )}
    </div>
  );
}
