import { geocodeAddress } from "@spectrum/shared";
import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen } from "@/components/ui/controls";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

interface RequestRow {
  id: string;
  user_id: string;
  id_doc_path: string;
  address_doc_path: string;
  address_text: string;
  created_at: string;
}

async function openDoc(path: string) {
  const { data, error } = await supabase.storage
    .from("verification-docs")
    .createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? "no signed url");
  await Linking.openURL(data.signedUrl);
}

function RequestCard({ req, onDone }: { req: RequestRow; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      let geo = null;
      if (approve) {
        geo = await geocodeAddress(req.address_text);
        if (!geo) throw new Error("Could not geocode that address — fix it or reject.");
      }
      const { error: err } = await supabase.rpc("review_verification", {
        request_id: req.id,
        approve,
        notes: notes.trim() || null,
        geocoded_lat: geo?.latitude ?? null,
        geocoded_lng: geo?.longitude ?? null,
        geocoded_city: geo?.city ?? null,
        geocoded_neighborhood: geo?.neighbourhood ?? null,
      });
      if (err) throw new Error(err.message);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <ThemedText type="smallBold">{req.address_text}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Submitted {new Date(req.created_at).toLocaleDateString()}
      </ThemedText>
      <Button title="View photo ID" kind="secondary" onPress={() => void openDoc(req.id_doc_path)} />
      <Button
        title="View proof of address"
        kind="secondary"
        onPress={() => void openDoc(req.address_doc_path)}
      />
      <Field label="Reviewer notes" value={notes} onChangeText={setNotes} />
      {error ? <ThemedText type="small" style={{ color: "#d64545" }}>{error}</ThemedText> : null}
      <Button title="Approve" onPress={() => void review(true)} loading={busy} />
      <Button title="Reject" kind="danger" onPress={() => void review(false)} loading={busy} />
    </Card>
  );
}

export default function AdminQueue() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("verification_requests")
      .select("id, user_id, id_doc_path, address_doc_path, address_text, created_at")
      .eq("status", "pending")
      .order("created_at");
    setRequests((data as RequestRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (profile?.role !== "admin") {
    return (
      <Screen>
        <ThemedText>Administrators only.</ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Pending verifications</ThemedText>
      {requests.length === 0 ? (
        <ThemedText themeColor="textSecondary">Queue is empty. 🎉</ThemedText>
      ) : (
        requests.map((r) => <RequestCard key={r.id} req={r} onDone={() => void load()} />)
      )}
    </Screen>
  );
}
