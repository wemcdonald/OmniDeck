import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ValidateResult, type InstallResult } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";
import { PluginPreview } from "./PluginPreview.tsx";

interface PluginGitHubTabProps {
  onClose: () => void;
}

export function PluginGitHubTab({ onClose }: PluginGitHubTabProps) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState<ValidateResult | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const validateMutation = useMutation({
    mutationFn: (githubUrl: string) => api.plugins.validateGitHub(githubUrl),
    onSuccess: (result) => {
      if (result.status === "error") {
        setError(result.errors?.join(", ") ?? "Validation failed");
      } else {
        setValidated(result);
      }
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

  const installMutation = useMutation({
    mutationFn: (overwrite: boolean) => api.plugins.installFromGitHub(url, overwrite),
    onSuccess: (result) => {
      setInstallResult(result);
      if (result.status === "installed") {
        queryClient.invalidateQueries({ queryKey: ["plugins"] });
        queryClient.invalidateQueries({ queryKey: ["status", "plugins"] });
      }
    },
    onError: (err) => {
      setInstallResult({
        status: "error",
        errors: [(err as Error).message],
      });
    },
  });

  function handleValidate() {
    if (!url.trim()) return;
    setError(null);
    setValidated(null);
    validateMutation.mutate(url);
  }

  function handleInstall(overwrite: boolean) {
    installMutation.mutate(overwrite);
  }

  // Success state
  if (installResult?.status === "installed") {
    return (
      <div className="text-center space-y-3 py-8">
        <p className="text-sm font-medium">
          Plugin &ldquo;{installResult.plugin?.name}&rdquo; installed!
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

  // Error from install
  if (installResult?.status === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-destructive">Installation failed</p>
        <ul className="text-sm text-muted-foreground list-disc pl-4">
          {installResult.errors?.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
        <Button
          variant="outline"
          onClick={() => {
            setInstallResult(null);
            setValidated(null);
          }}
        >
          Back
        </Button>
      </div>
    );
  }

  // Conflict from install
  if (installResult?.status === "conflict" && validated?.manifest) {
    return (
      <PluginPreview
        manifest={validated.manifest}
        installedVersion={installResult.installed?.version}
        loading={installMutation.isPending}
        onConfirm={() => handleInstall(true)}
        onCancel={() => {
          setInstallResult(null);
          setValidated(null);
        }}
      />
    );
  }

  // Preview state (validated, ready to install)
  if (validated?.manifest) {
    return (
      <PluginPreview
        manifest={validated.manifest}
        loading={installMutation.isPending}
        onConfirm={(overwrite) => handleInstall(overwrite)}
        onCancel={() => setValidated(null)}
      />
    );
  }

  // URL input state
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">GitHub URL</label>
        <input
          className="w-full rounded bg-surface-container-high border border-outline-variant px-2 py-1.5 text-sm"
          placeholder="https://github.com/user/repo/tree/main/my-plugin"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleValidate()}
        />
        <p className="text-xs text-muted-foreground">
          Paste a link to a GitHub repo or a directory within a repo containing a plugin.
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive">{error}</div>
      )}

      <Button onClick={handleValidate} disabled={validateMutation.isPending || !url.trim()}>
        {validateMutation.isPending ? "Fetching..." : "Fetch Plugin"}
      </Button>
    </div>
  );
}
