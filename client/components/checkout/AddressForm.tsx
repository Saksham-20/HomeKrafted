import styles from "./AddressForm.module.css";

export interface AddressFormValues {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export interface AddressFormProps {
  values: AddressFormValues;
  onChange: (values: AddressFormValues) => void;
  idPrefix: string;
}

export const EMPTY_ADDRESS_FORM: AddressFormValues = {
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
};

/**
 * Shared address field set — used both for checkout's inline "add
 * address" (own address book, full CRUD is M7) and the gift-to-recipient
 * form (a one-off address, not saved to the book).
 */
export function AddressForm({ values, onChange, idPrefix }: AddressFormProps) {
  function set<K extends keyof AddressFormValues>(key: K, value: AddressFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className={styles.grid}>
      <label className={styles.field}>
        <span className={styles.label}>Full name</span>
        <input
          className={styles.input}
          id={`${idPrefix}-name`}
          value={values.recipientName}
          onChange={(event) => set("recipientName", event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Phone</span>
        <input
          className={styles.input}
          id={`${idPrefix}-phone`}
          value={values.phone}
          onChange={(event) => set("phone", event.target.value)}
        />
      </label>
      <label className={styles.fieldWide}>
        <span className={styles.label}>Address line 1</span>
        <input
          className={styles.input}
          id={`${idPrefix}-line1`}
          value={values.line1}
          onChange={(event) => set("line1", event.target.value)}
        />
      </label>
      <label className={styles.fieldWide}>
        <span className={styles.label}>Address line 2 (optional)</span>
        <input
          className={styles.input}
          id={`${idPrefix}-line2`}
          value={values.line2}
          onChange={(event) => set("line2", event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>City</span>
        <input
          className={styles.input}
          id={`${idPrefix}-city`}
          value={values.city}
          onChange={(event) => set("city", event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>State</span>
        <input
          className={styles.input}
          id={`${idPrefix}-state`}
          value={values.state}
          onChange={(event) => set("state", event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Pincode</span>
        <input
          className={styles.input}
          id={`${idPrefix}-pincode`}
          value={values.pincode}
          onChange={(event) => set("pincode", event.target.value)}
        />
      </label>
    </div>
  );
}
