import { Field, TextField, Toggle } from 'decky-frontend-lib';
import { ChangeEventHandler, FunctionComponent } from 'react';

interface SettingProps {
  type: string;
  label: string;
  description?: string;
  setting: string;
  value: any;
  onChange: (setting: string, value: string) => void;
}

const SettingItem: FunctionComponent<SettingProps> = ({type, label, description, setting, value, onChange}) => {
  const onChangeInner = (value: any) => onChange(setting, value);
  const onChangeTextFieldInner: ChangeEventHandler<HTMLInputElement> = (e) => onChangeInner(e.target.value);

  switch (type) {
    case "password":
      return (
        <Field label={label} description={(
          <TextField
            value={value}
            bIsPassword={true}
            onChange={onChangeTextFieldInner}
            description={description}
          />
        )} />
      );
    case "bool":
      return (
        <Field label={label} description={description}>
          <Toggle
            value={value}
            onChange={onChangeInner}
          />
        </Field>
      );
    case "int":
      return (
        <Field label={label}>
          <TextField
            value={value}
            mustBeNumeric={true}
            onChange={onChangeTextFieldInner}
            style={{ minWidth: '80px' }}
            description={description}
          />
        </Field>
      );
    case "str":
    default:
      return (
        <Field label={label} description={(
          <TextField
            value={value}
            onChange={onChangeTextFieldInner}
            description={description}
          />
        )} />
      );
  }
};

export default SettingItem;
