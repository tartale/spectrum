import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { ThemedText } from "@/components/themed-text";
import { Card, ChipGroup, Field, Screen } from "@/components/ui/controls";
import {
  getActiveQuestions,
  getAnswers,
  getChild,
  saveAnswer,
  type ChildRow,
  type QuestionRow,
} from "@/lib/data";

/**
 * The questionnaire. Answers save on change and are always editable; the
 * versioned questionnaire lives in the database so it can evolve server-side.
 */
export default function ChildProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, qs, ans] = await Promise.all([getChild(id), getActiveQuestions(), getAnswers(id)]);
      setChild(c);
      setQuestions(qs);
      setAnswers(ans);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function setValues(questionId: string, values: string[]) {
    setAnswers((prev) => ({ ...prev, [questionId]: values }));
    if (id) void saveAnswer(id, questionId, values).catch((e) => setError(String(e)));
  }

  if (!child) {
    return (
      <Screen>
        {error ? <ThemedText style={{ color: "#d64545" }}>{error}</ThemedText> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{child.nickname}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Born {child.birth_year}. Answers save automatically and you can change them anytime — better
        answers mean better matches.
      </ThemedText>
      {error ? <ThemedText style={{ color: "#d64545" }}>{error}</ThemedText> : null}
      {questions.map((q) => (
        <Card key={q.id}>
          <ThemedText type="smallBold">{q.prompt}</ThemedText>
          {q.kind === "free_text" ? (
            <Field
              multiline
              value={answers[q.id]?.[0] ?? ""}
              onChangeText={(text) => setValues(q.id, text ? [text] : [])}
              placeholder="Optional"
            />
          ) : (
            <ChipGroup
              options={q.options}
              selected={answers[q.id] ?? []}
              single={q.kind !== "multi_select"}
              onToggle={(next) => setValues(q.id, next)}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}
