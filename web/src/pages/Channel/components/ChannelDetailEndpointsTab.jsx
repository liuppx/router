import React, { useMemo } from 'react';
import {
  AppAlert,
  AppDetailSection,
  AppIcon,
  AppPopconfirm,
  AppSwitch,
  AppTable,
  AppTableActionButton,
  AppTooltip,
} from '../../../router-ui';

const formatTimestamp = (value) => {
  const timestamp = Number(value || 0);
  if (timestamp <= 0) {
    return '';
  }
  return new Date(timestamp * 1000).toLocaleString();
};

const resolvePolicyTemplateLabel = (t, templateKey) => {
  const normalized = (templateKey || '').toString().trim();
  switch (normalized) {
    case 'OVERRIDE_ENDPOINT_BASE_URL':
      return t('channel.edit.endpoint_policies.templates.override_base_url');
    case 'IMAGE_URL_TO_BASE64':
      return t('channel.edit.endpoint_policies.templates.image_url_to_base64');
    case 'CUSTOM_REQUEST_POLICY':
      return t('channel.edit.endpoint_policies.templates.custom_request_policy');
    default:
      return normalized || '-';
  }
};

const ChannelDetailEndpointsTab = ({
  t,
  columnWidths,
  endpointSummaryText,
  channelEndpoints,
  channelEndpointsLoading,
  channelEndpointsError,
  buildChannelEndpointKey,
  endpointCapabilityReadonly,
  endpointMutatingKey,
  updateChannelEndpointCapability,
  channelEndpointPoliciesLoading,
  channelEndpointPolicies = [],
  channelEndpointPoliciesError,
  endpointPolicyReadonly,
  endpointPolicyDeletingKey,
  removeEndpointPolicy = () => {},
  openEndpointPolicyEditor,
}) => {
  const buildDisableInfo = (row) => {
    const parts = [];
    const disabledBy = (row?.disabled_by || '').toString().trim();
    const disabledAt = formatTimestamp(row?.disabled_at);
    const disabledReason = (row?.disabled_reason || '').toString().trim();
    if (disabledBy) {
      parts.push(t('channel.edit.capability_disable.by', { value: disabledBy }));
    }
    if (disabledAt) {
      parts.push(t('channel.edit.capability_disable.at', { value: disabledAt }));
    }
    if (disabledReason) {
      parts.push(t('channel.edit.capability_disable.reason', { value: disabledReason }));
    }
    return parts.join('\n');
  };

  const policiesByKey = useMemo(() => {
    const result = new Map();
    channelEndpointPolicies.forEach((row) => {
      const key = buildChannelEndpointKey(row.model, row.endpoint);
      if (!result.has(key)) {
        result.set(key, []);
      }
      result.get(key).push(row);
    });
    return result;
  }, [buildChannelEndpointKey, channelEndpointPolicies]);

  return (
    <AppDetailSection
      title={t('channel.edit.endpoint_capabilities.title')}
      titleTag='span'
      headerStart={<span className='router-toolbar-meta'>({endpointSummaryText})</span>}
    >
      <div>
        <AppAlert
          type='info'
          showIcon
          className='router-section-message'
          title={t('channel.edit.endpoint_capabilities.hint')}
        />
        <AppTable
          className='router-detail-table router-channel-endpoint-capability-table'
          pagination={false}
          scroll={{ x: 680 }}
          locale={{
            emptyText: channelEndpointsLoading
              ? t('channel.edit.endpoint_capabilities.loading')
              : channelEndpoints.length === 0
                ? t('channel.edit.endpoint_capabilities.empty')
                : t('channel.edit.endpoint_capabilities.empty'),
          }}
          rowKey={(row) => buildChannelEndpointKey(row.model, row.endpoint)}
          dataSource={channelEndpoints}
          columns={[
            {
              title: t('channel.edit.endpoint_capabilities.table.model'),
              dataIndex: 'model',
              key: 'model',
              width: columnWidths[0],
              render: (value) => (
                <span
                  className='router-cell-truncate router-monospace-value'
                  title={value}
                >
                  {value}
                </span>
              ),
            },
            {
              title: t('channel.edit.endpoint_capabilities.table.endpoint'),
              dataIndex: 'endpoint',
              key: 'endpoint',
              width: columnWidths[1],
              render: (value) => (
                <span className='router-cell-truncate' title={value}>
                  {value}
                </span>
              ),
            },
            {
              title: t('channel.edit.endpoint_capabilities.table.enabled'),
              key: 'enabled',
              width: columnWidths[2],
              align: 'center',
              render: (_, row) => {
                const endpointKey = buildChannelEndpointKey(
                  row.model,
                  row.endpoint,
                );
                const isMutating = endpointMutatingKey === endpointKey;
                const blockedReason = (row.enable_block_reason || '').trim();
                const disableInfo = buildDisableInfo(row);
                const disabled =
                  endpointCapabilityReadonly ||
                  isMutating ||
                  (!!blockedReason && row.enabled !== true);
                return (
                  <AppSwitch
                    checked={row.enabled === true}
                    disabled={disabled}
                    title={blockedReason || disableInfo || undefined}
                    onChange={(_, { checked }) =>
                      updateChannelEndpointCapability(row, {
                        enabled: checked === true,
                      })
                    }
                  />
                );
              },
            },
            {
              title: t('channel.edit.endpoint_capabilities.table.access_policy'),
              key: 'policy',
              width: columnWidths[3],
              render: (_, row) => {
                const endpointKey = buildChannelEndpointKey(
                  row.model,
                  row.endpoint,
                );
                const policyRows = policiesByKey.get(endpointKey) || [];
                if (
                  channelEndpointPoliciesLoading &&
                  channelEndpointPolicies.length === 0
                ) {
                  return (
                    <span className='router-cell-truncate'>
                      {t('channel.edit.endpoint_policies.loading')}
                    </span>
                  );
                }
                if (policyRows.length === 0) {
                  return (
                    <span className='router-muted-text'>
                      {t('channel.edit.endpoint_policies.status.not_configured')}
                    </span>
                  );
                }
                return (
                  <div className='router-endpoint-policy-chip-list'>
                    {policyRows.map((policyRow) => {
                      const policyID = (policyRow.id || '').toString().trim();
                      const deleting = endpointPolicyDeletingKey === policyID;
                      const label = resolvePolicyTemplateLabel(
                        t,
                        policyRow.template_key,
                      );
                      return (
                        <span
                          key={policyID || `${endpointKey}-${policyRow.template_key}`}
                          className={[
                            'router-endpoint-policy-chip',
                            policyRow.enabled
                              ? ''
                              : 'router-endpoint-policy-chip-disabled',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={label}
                        >
                          <span className='router-endpoint-policy-chip-label'>
                            {label}
                          </span>
                          <AppTooltip title={t('channel.edit.endpoint_policies.remove_action')}>
                            <AppPopconfirm
                              title={t('channel.edit.endpoint_policies.confirm_remove')}
                              okButtonProps={{ danger: true }}
                              onConfirm={() => removeEndpointPolicy(policyRow)}
                              disabled={
                                endpointPolicyReadonly ||
                                deleting ||
                                policyID === ''
                              }
                            >
                              <span>
                                <button
                                  type='button'
                                  className='router-endpoint-policy-chip-remove'
                                  disabled={
                                    endpointPolicyReadonly ||
                                    deleting ||
                                    policyID === ''
                                  }
                                >
                                  {deleting ? (
                                    <AppIcon name='spinner' />
                                  ) : (
                                    <AppIcon name='close' />
                                  )}
                                </button>
                              </span>
                            </AppPopconfirm>
                          </AppTooltip>
                        </span>
                      );
                    })}
                  </div>
                );
              },
            },
            {
              title: t('channel.edit.endpoint_policies.table.actions'),
              key: 'actions',
              width: columnWidths[4],
              align: 'center',
              render: (_, row) => (
                <AppTableActionButton
                  icon='plus'
                  title={t('channel.edit.endpoint_policies.add_action')}
                  disabled={endpointPolicyReadonly}
                  onClick={() => openEndpointPolicyEditor(row)}
                />
              ),
            },
          ]}
        />
        {channelEndpointsError && (
          <div className='router-error-text router-error-text-top'>
            {channelEndpointsError}
          </div>
        )}
        {channelEndpointPoliciesError && (
          <div className='router-error-text router-error-text-top'>
            {channelEndpointPoliciesError}
          </div>
        )}
      </div>
    </AppDetailSection>
  );
};

export default ChannelDetailEndpointsTab;
