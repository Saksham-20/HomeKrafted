import type { ReactNode } from "react";
import { LegalPage } from "@/components/legal/LegalPage";
import { LegalDetail } from "@/components/legal/LegalDetail";
import styles from "@/components/legal/LegalPage.module.css";
import { LEGAL_ENTITY, isPlaceholder } from "@/lib/legal";
import type { PolicyBlock, PolicyDoc } from "@/lib/policies/types";
import { splitPolicyText, type PolicyToken } from "@/lib/policies/tokens";

/**
 * Renders one client-reviewed policy document (`lib/policies/`) in the
 * shared `LegalPage` shell.
 *
 * The frame is ours; the words are the client's and arrive as data. This
 * component's whole job is to lay them out without changing them — so it
 * has no opinion about a sentence, and the only text it ever adds is the
 * "not published yet" stand-in for a `LEGAL_ENTITY` value that is still a
 * placeholder.
 */
export function PolicyDocument({ doc }: { doc: PolicyDoc }) {
  return (
    <LegalPage
      title={doc.title}
      intro={doc.lead}
      showsBusinessDetails={doc.showsBusinessDetails}
    >
      {doc.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </LegalPage>
  );
}

const TOKEN_VALUES: Record<PolicyToken, () => string> = {
  supportEmail: () => LEGAL_ENTITY.supportEmail,
  grievanceEmail: () => LEGAL_ENTITY.grievanceEmail,
};

/** A line of text with its tokens resolved and its email addresses linked. */
function Inline({ text }: { text: string }): ReactNode {
  return (
    <>
      {splitPolicyText(text).map((part, index) => {
        if (part.type === "text") return part.value;

        const address = part.type === "token" ? TOKEN_VALUES[part.name]() : part.value;
        if (isPlaceholder(address)) {
          return (
            <span key={index} className={styles.pending}>
              not published yet
            </span>
          );
        }
        return (
          <a key={index} href={`mailto:${address}`}>
            {address}
          </a>
        );
      })}
    </>
  );
}

function Block({ block }: { block: PolicyBlock }): ReactNode {
  switch (block.kind) {
    case "h2":
      return <h2>{block.text}</h2>;
    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case "ul":
      return (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case "lines":
      return (
        <p>
          {block.lines.map((line, index) => (
            <span key={index}>
              {index > 0 && <br />}
              <Inline text={line} />
            </span>
          ))}
        </p>
      );
    case "officer":
      return <GrievanceOfficer />;
  }
}

/**
 * The client's fill-in block, read from `LEGAL_ENTITY` so a value that has
 * not been supplied says so instead of printing a bracketed tag. The phone
 * and address are the company's own — the reviewed text asks for both and
 * gives no separate line for the officer, so until there is one they are
 * the same number and the same registered office.
 */
function GrievanceOfficer(): ReactNode {
  const address = LEGAL_ENTITY.address.every(isPlaceholder)
    ? LEGAL_ENTITY.address[0]
    : LEGAL_ENTITY.address.join(", ");

  return (
    <div>
      <LegalDetail label="Name" value={LEGAL_ENTITY.grievanceOfficer} />
      <LegalDetail label="Designation" value="Grievance Officer" />
      <LegalDetail label="Company" value={LEGAL_ENTITY.legalName} />
      <LegalDetail
        label="Email"
        value={LEGAL_ENTITY.grievanceEmail}
        href={`mailto:${LEGAL_ENTITY.grievanceEmail}`}
      />
      <LegalDetail label="Phone" value={LEGAL_ENTITY.supportPhone} />
      <LegalDetail label="Address" value={address} />
    </div>
  );
}
