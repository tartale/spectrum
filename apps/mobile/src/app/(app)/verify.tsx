import * as DocumentPicker from "expo-document-picker";
import { File as FSFile } from "expo-file-system";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button, Card, Field, Screen } from "@/components/ui/controls";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

type PickedDoc = DocumentPicker.DocumentPickerAsset;

async function uploadDoc(path: string, doc: PickedDoc): Promise<void> {
  const contentType = doc.mimeType ?? "application/octet-stream";
  const body =
    Platform.OS === "web" && doc.file ? doc.file : await new FSFile(doc.uri).arrayBuffer();
  const { error } = await supabase.storage
    .from("verification-docs")
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

function DocPicker({
  label,
  doc,
  onPick,
}: {
  label: string;
  doc: PickedDoc | null;
  onPick: (d: PickedDoc) => void;
}) {
  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
    });
    const asset = res.assets?.[0];
    if (asset) onPick(asset);
  }
  return (
    <Card>
      <ThemedText type="smallBold">{label}</ThemedText>
      {doc ? (
        <ThemedText type="small" themeColor="textSecondary">
          Selected: {doc.name}
        </ThemedText>
      ) : null}
      <Button title={doc ? "Choose a different file" : "Choose file"} onPress={pick} kind="secondary" />
    </Card>
  );
}

export default function Verify() {
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [idDoc, setIdDoc] = useState<PickedDoc | null>(null);
  const [addressDoc, setAddressDoc] = useState<PickedDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!session || !idDoc || !addressDoc) return;
    setBusy(true);
    setError(null);
    try {
      const stamp = Date.now();
      const idPath = `${session.user.id}/${stamp}-id-${idDoc.name}`;
      const addressPath = `${session.user.id}/${stamp}-address-${addressDoc.name}`;
      await uploadDoc(idPath, idDoc);
      await uploadDoc(addressPath, addressDoc);
      const { error: err } = await supabase.from("verification_requests").insert({
        user_id: session.user.id,
        id_doc_path: idPath,
        address_doc_path: addressPath,
        address_text: address.trim(),
      });
      if (err) throw new Error(err.message);
      await refreshProfile();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Upload a government-issued photo ID (driver&apos;s license or state ID) and a proof of
        address (utility bill, lease). Documents are stored privately, visible only to Spectrum
        administrators, and never shown to other members.
      </ThemedText>
      <Field
        label="Home address"
        placeholder="Street, city, state, ZIP"
        value={address}
        onChangeText={setAddress}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Your address determines your neighborhood groups. Other families only ever see your city,
        neighborhood, and approximate distance — never your address.
      </ThemedText>
      <DocPicker label="Photo ID" doc={idDoc} onPick={setIdDoc} />
      <DocPicker label="Proof of address" doc={addressDoc} onPick={setAddressDoc} />
      {error ? <ThemedText type="small" style={{ color: "#d64545" }}>{error}</ThemedText> : null}
      <Button
        title="Submit for review"
        onPress={submit}
        loading={busy}
        disabled={!address.trim() || !idDoc || !addressDoc}
      />
    </Screen>
  );
}
