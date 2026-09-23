import React from 'react';
import { Form } from 'antd';

function AppForm({ className = '', children, ...props }) {
  const nextClassName = ['router-ui-form', className].filter(Boolean).join(' ');
  return <Form {...props} className={nextClassName}>{children}</Form>;
}

AppForm.Item = Form.Item;
AppForm.useForm = Form.useForm;

export default AppForm;
