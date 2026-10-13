// Jira's "Create" dialog, trimmed to what an issue needs here: summary,
// type, project and priority. The server may refuse; its message (and any
// per-field messages) show in the dialog, which stays open.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import Button from "@atlaskit/button/new";
import Modal, { ModalBody, ModalFooter, ModalHeader, ModalTitle } from "@atlaskit/modal-dialog";
import Select from "@atlaskit/select";
import Textfield from "@atlaskit/textfield";
import { token } from "@atlaskit/tokens";
import { observer, useCollection } from "@vantage-ui/client/react";
import { useDb } from "../db";
import { issueHref } from "../jira/issueHref";
import { PRIORITIES, PRIORITY_LABELS, TYPES, TYPE_LABELS, type IssuePriority, type IssueType } from "../jira/issueFields";
import { Field } from "./Field";

type Option<T> = { value: T; label: string };

export const CreateIssueModal = observer(function CreateIssueModal({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const navigate = useNavigate();
  const projects = useCollection(db.projects.all);
  const projectOptions = projects.items.map((p) => ({ value: p.id, label: p.name ?? p.key ?? p.id }));
  const typeOptions = TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));
  const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

  const [title, setTitle] = useState("");
  const [project, setProject] = useState<Option<string> | null>(null);
  const [type, setType] = useState<Option<IssueType>>(typeOptions.find((o) => o.value === "task") ?? typeOptions[0]!);
  const [priority, setPriority] = useState<Option<IssuePriority>>(priorityOptions.find((o) => o.value === "medium") ?? priorityOptions[0]!);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; fields: Record<string, string> } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await db.issues.create({
      title,
      project: (project ?? projectOptions[0])?.value ?? null,
      type: type.value,
      priority: priority.value,
      status: "todo",
    });
    setPending(false);
    if (!result.ok) {
      setRefusal({ message: result.error.message, fields: result.error.fieldErrors });
      return;
    }
    onClose();
    navigate(issueHref(result.value));
  };

  return (
    <Modal onClose={onClose} width="medium">
      <form onSubmit={submit} aria-label="Create issue">
        <ModalHeader hasCloseButton>
          <ModalTitle>Create issue</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {refusal && (
            <p role="alert" style={alert}>
              {refusal.message}
            </p>
          )}
          <Field label="Project" error={refusal?.fields.project}>
            {(id) => (
              <Select inputId={id} options={projectOptions} value={project ?? projectOptions[0] ?? null} onChange={(o) => setProject(o)} />
            )}
          </Field>
          <Field label="Work type" error={refusal?.fields.type}>
            {(id) => <Select inputId={id} options={typeOptions} value={type} onChange={(o) => o && setType(o)} />}
          </Field>
          <Field label="Summary" required error={refusal?.fields.title}>
            {(id) => <Textfield id={id} value={title} isRequired onChange={(e) => setTitle(e.currentTarget.value)} />}
          </Field>
          <Field label="Priority" error={refusal?.fields.priority}>
            {(id) => <Select inputId={id} options={priorityOptions} value={priority} onChange={(o) => o && setPriority(o)} />}
          </Field>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="primary" type="submit" isDisabled={!title.trim()} isLoading={pending}>
            Create
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
});

const alert = {
  margin: `0 0 ${token("space.200")}`,
  padding: `${token("space.100")} ${token("space.150")}`,
  borderRadius: token("radius.small"),
  background: token("color.background.danger"),
  color: token("color.text.danger"),
};
