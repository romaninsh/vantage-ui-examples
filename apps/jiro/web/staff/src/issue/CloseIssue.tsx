// "Close issue", as Jira asks it: a confirmation dialog, then the server's
// `close_issue` row action runs once. The status lozenge updates from the
// issue's live change; the button goes once `$actions` no longer offers it.
import { useState } from "react";
import Button from "@atlaskit/button/new";
import Modal, { ModalBody, ModalFooter, ModalHeader, ModalTitle } from "@atlaskit/modal-dialog";
import { token } from "@atlaskit/tokens";
import { observer, useRun } from "@vantage-ui/client/react";
import type { Issues } from "../vantage.gen";

export const CloseIssue = observer(function CloseIssue({ issue }: { issue: Issues }) {
  const [asking, setAsking] = useState(false);
  const close = useRun(issue.$run.close_issue);
  const pending = close.status === "starting" || close.status === "running";
  if (!issue.$actions.includes("close_issue") && !asking) return null;

  const confirm = async () => {
    const outcome = await close.start().done;
    if (outcome.ok) setAsking(false);
  };
  // Once confirmed, the close happens on the server whatever the dialog does,
  // so the dialog stays until it ends.
  const dismiss = () => {
    if (pending) return;
    close.forget();
    setAsking(false);
  };

  return (
    <>
      <Button onClick={() => setAsking(true)}>Close issue</Button>
      {asking && (
        <Modal onClose={dismiss} width="small">
          <ModalHeader hasCloseButton>
            <ModalTitle>Close {issue.key ?? "this issue"}?</ModalTitle>
          </ModalHeader>
          <ModalBody>
            {close.error && (
              <p role="alert" style={alert}>
                {close.error.message}
              </p>
            )}
            <p>It moves to Done.</p>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" isDisabled={pending} onClick={dismiss}>
              Cancel
            </Button>
            <Button appearance="primary" isLoading={pending} onClick={() => void confirm()}>
              Close issue
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
});

const alert = {
  margin: `0 0 ${token("space.200")}`,
  padding: `${token("space.100")} ${token("space.150")}`,
  borderRadius: token("radius.small"),
  background: token("color.background.danger"),
  color: token("color.text.danger"),
};
