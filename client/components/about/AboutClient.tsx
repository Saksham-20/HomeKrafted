import Link from "next/link";
import clsx from "clsx";
import { AtSign, Mail, MapPin, Phone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { backedBy, type AboutContent } from "@/lib/data";
import styles from "./AboutClient.module.css";

export interface AboutClientProps {
  content: AboutContent;
}

/**
 * `/about` — the brand story carried over from the marketing site this app
 * replaces (see `lib/data/about.ts` for provenance).
 *
 * Server component: it's static copy with no interaction, so there's no
 * reason to ship it to the client. Named `*Client` only to match the
 * established file convention for a page's body component.
 */
export function AboutClient({ content }: AboutClientProps) {
  return (
    <div className={clsx("container", styles.page)}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{content.eyebrow}</span>
        <h1 className={styles.title}>{content.title}</h1>
        <p className={styles.lede}>{content.lede}</p>
      </header>

      <section className={styles.storySection} aria-labelledby="about-story">
        <div className={styles.storyCopy}>
          <h2 id="about-story" className={styles.h2}>
            {content.storyHeading}
          </h2>
          {content.story.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className={styles.body}>
              {paragraph}
            </p>
          ))}
        </div>
        <div className={styles.storyImage}>
          <ImageSlot ratio="4/5" label="maker_kitchen.jpg" src="/images/site/maker-kitchen.jpg" />
        </div>
      </section>

      <Card className={styles.missionCard}>
        <span className={styles.missionEyebrow}>{content.missionHeading}</span>
        <p className={styles.missionText}>{content.mission}</p>
      </Card>

      <section aria-labelledby="about-pillars">
        <h2 id="about-pillars" className={styles.h2}>
          {content.pillarsHeading}
        </h2>
        <div className={styles.pillarGrid}>
          {content.pillars.map((pillar) => (
            <Card key={pillar.title} className={styles.pillar}>
              <h3 className={styles.pillarTitle}>{pillar.title}</h3>
              <p className={styles.pillarBody}>{pillar.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="about-offerings">
        <h2 id="about-offerings" className={styles.h2}>
          {content.offeringsHeading}
        </h2>
        <ul className={styles.offeringList}>
          {content.offerings.map((offering) => (
            <li key={offering.title} className={styles.offering}>
              <div className={styles.offeringHead}>
                <h3 className={styles.offeringTitle}>{offering.title}</h3>
                {offering.comingSoon && <span className={styles.soon}>Coming soon</span>}
              </div>
              <p className={styles.offeringBody}>{offering.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-team">
        <h2 id="about-team" className={styles.h2}>
          {content.teamHeading}
        </h2>
        <p className={styles.teamIntro}>{content.teamIntro}</p>
        <div className={styles.teamGrid}>
          {/*
            The label is the person's name, not a filename. `ImageSlot`
            prints its label inside the placeholder, so `"founder.jpg"`
            and `` `${member.name}.jpg` `` rendered the literal strings
            "founder.jpg" and "Lavya.jpg" in the circles where the team's
            faces belong — which is what the brand review reported as
            broken images. Nothing was broken; the label was the bug.

            `alt=""` throughout: the name is the very next element in the
            DOM, so announcing it twice is noise (see `ImageSlot`'s prop
            notes). `sizes` is set because these are 64px circles — the
            default is a grid card, which would pull a viewport-wide file
            to fill a thumbnail.
          */}
          <Card className={clsx(styles.member, styles.founder)}>
            <ImageSlot
              ratio="1/1"
              shape="circle"
              label={content.founder.name}
              src={content.founder.photoSrc}
              alt=""
              sizes="64px"
              compact
            />
            <div>
              <div className={styles.memberName}>{content.founder.name}</div>
              <div className={styles.memberRole}>{content.founder.role}</div>
            </div>
          </Card>
          {content.team.map((member) => (
            <Card key={member.name} className={styles.member}>
              <ImageSlot
                ratio="1/1"
                shape="circle"
                label={member.name}
                src={member.photoSrc}
                alt=""
                sizes="64px"
                compact
              />
              <div>
                <div className={styles.memberName}>{member.name}</div>
                <div className={styles.memberRole}>{member.role}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/*
        Institutional claims — moved here from the home page in M28.

        On Home this strip sat directly under "Meet the Hands Behind the
        Flavours", so three incubator marks were the last thing a visitor
        saw after the makers: borrowed institutional credibility placed
        where the makers' own should carry the page. It belongs on the
        page somebody reads when they are specifically asking who is
        behind this.

        The two editing rules survive the move and are not negotiable
        (`backedBy` in `lib/data/site.ts`): **never alter a mark** — no
        recolour, no grayscale, no crop; optical differences are handled
        by the per-logo width variables below — and **keep the `detail`
        sentence under each mark**, because the logo identifies the
        organisation while the sentence states the relationship, and
        dropping it turns a stated affiliation into an implied
        endorsement. The standing "confirm these relationships in
        writing" warning moves with it.
      */}
      <section className={styles.backedBy} aria-labelledby="about-backers">
        <h2 id="about-backers" className={styles.backedByLabel}>
          Backed by
        </h2>
        <ul className={styles.backerRow}>
          {backedBy.map((backer) => (
            <li key={backer.id} className={styles.backer}>
              {backer.logoSrc && backer.logoRatio ? (
                <span className={clsx(styles.backerMark, styles[backer.id])}>
                  <ImageSlot
                    ratio={backer.logoRatio}
                    label={backer.label}
                    alt={backer.logoAlt ?? backer.label}
                    src={backer.logoSrc}
                    sizes={backer.logoSizes}
                  />
                </span>
              ) : null}
              <span className={styles.backerDetail}>{backer.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.contact} aria-labelledby="about-contact">
        <div>
          <h2 id="about-contact" className={styles.h2}>
            {content.contactHeading}
          </h2>
          <p className={styles.body}>{content.contactLine}</p>
          <div className={styles.ctaRow}>
            <Link href="/sell" className={styles.primaryCta}>
              Become a HomeKrafter
            </Link>
            <Link href="/support" className={styles.secondaryCta}>
              Contact support
            </Link>
          </div>
        </div>

        <Card className={styles.contactCard}>
          <div className={styles.contactRow}>
            <MapPin size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{content.city}</span>
          </div>
          {content.phones.map((phone) => (
            <a key={phone} className={styles.contactRow} href={`tel:${phone.replace(/\s/g, "")}`}>
              <Phone size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{phone}</span>
            </a>
          ))}
          <a className={styles.contactRow} href={`mailto:${content.email}`}>
            <Mail size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{content.email}</span>
          </a>
          <a
            className={styles.contactRow}
            href={content.instagram.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {/* lucide-react ships no brand glyphs; @ reads correctly for a handle. */}
            <AtSign size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{content.instagram.handle}</span>
          </a>
        </Card>
      </section>
    </div>
  );
}
