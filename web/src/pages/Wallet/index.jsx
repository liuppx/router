import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppAlert,
  AppButton,
  AppField,
  AppFilterHeader,
  AppFormRow,
  AppInput,
  AppInputNumber,
  AppSection,
  AppTextarea,
} from '../../router-ui';
import { showError, showSuccess } from '../../helpers';

// This page is an operator-only wallet playground (connect / sign / send).
// Copy is intentionally Chinese-only because the operator-facing surface
// never localized the underlying wallet operations, and the surface is
// hidden from end-users. i18n-scan-hardcoded.mjs skips this file via the
// /* i18n-skip */ directive below.
/* i18n-skip */

const WalletPage = () => {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState('');
  const [balance, setBalance] = useState('');
  const [messageToSign, setMessageToSign] = useState('Login to Router');
  const [signResult, setSignResult] = useState('');
  const [tx, setTx] = useState({ to: '', value: '' });
  const [loading, setLoading] = useState(false);

  const hasWallet = typeof window !== 'undefined' && window.ethereum;

  useEffect(() => {
    if (hasWallet) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts && accounts.length > 0) {
          setAddress(accounts[0]);
          refreshBalance(accounts[0]);
        } else {
          setAddress('');
          setBalance('');
        }
      });
      window.ethereum.on('chainChanged', (id) => {
        setChainId(parseInt(id, 16).toString());
        if (address) {
          refreshBalance(address);
        }
      });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [hasWallet, address]);

  const connect = async () => {
    try {
      if (!hasWallet) {
        showError(t('wallet.not_detected'));
        return;
      }
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
      setChainId(parseInt(chainHex, 16).toString());
      if (accounts && accounts[0]) {
        setAddress(accounts[0]);
        refreshBalance(accounts[0]);
      }
    } catch (e) {
      showError(e.message || '连接失败');
    }
  };

  const refreshBalance = async (addr) => {
    try {
      const target = addr || address;
      if (!target) return;
      const result = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [target, 'latest'],
      });
      const eth = parseInt(result, 16) / 1e18;
      setBalance(eth.toFixed(4));
    } catch (e) {
      showError('获取余额失败: ' + e.message);
    }
  };

  const signMessage = async () => {
    try {
      if (!address) {
        showError('请先连接钱包');
        return;
      }
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [messageToSign, address],
      });
      setSignResult(signature);
      showSuccess('签名成功');
    } catch (e) {
      if (e?.code === 4001) {
        showError('用户取消签名');
      } else {
        showError(e.message || '签名失败');
      }
    }
  };

  const sendTx = async () => {
    try {
      if (!address) {
        showError('请先连接钱包');
        return;
      }
      if (!tx.to || !tx.value) {
        showError('请输入收款地址和金额');
        return;
      }
      setLoading(true);
      const wei = '0x' + Math.floor(parseFloat(tx.value) * 1e18).toString(16);
      const hash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: tx.to,
            value: wei,
          },
        ],
      });
      showSuccess('交易已提交：' + hash);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      if (e?.code === 4001) {
        showError('用户取消交易');
      } else {
        showError(e.message || '发送失败');
      }
    }
  };

  return (
    <div className='router-page-panel'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'account', label: t('header.account') },
          { key: 'wallet', label: 'Wallet', active: true },
        ]}
        title='Wallet'
      />
      <h2 className='router-page-title'>钱包工具</h2>
      {!hasWallet && (
        <AppAlert type='warning' className='router-section-message' title={
          未检测到 `window.ethereum`，请安装 MetaMask 或打开浏览器钱包后刷新。
        } />
      )}
      <AppSection>
        <div className='router-page-stack'>
          <AppButton className='router-section-button' color='blue' onClick={connect} disabled={!hasWallet}>
            连接钱包
          </AppButton>
          <div className='router-section-copy router-section-stack'>
            <div>地址：{address || '-'}</div>
            <div>链 ID：{chainId || '-'}</div>
            <div>余额：{balance ? `${balance} ETH` : '-'}</div>
          </div>
          <AppButton className='router-section-button' onClick={() => refreshBalance()}>
            刷新余额
          </AppButton>
        </div>
      </AppSection>

      <AppSection title='签名测试'>
        <div className='router-page-stack'>
          <AppFormRow>
            <AppField label='待签名消息'>
              <AppTextarea
                className='router-section-textarea'
                value={messageToSign}
                onChange={(e, { value }) => setMessageToSign(value)}
              />
            </AppField>
          </AppFormRow>
          <AppButton className='router-section-button' onClick={signMessage}>
            personal_sign
          </AppButton>
          {signResult && (
            <AppAlert
              type='success'
              className='router-section-message router-break-all'
              title={signResult}
            />
          )}
        </div>
      </AppSection>

      <AppSection title='发送 ETH'>
        <div className='router-page-stack'>
          <AppFormRow>
            <AppField label='收款地址'>
              <AppInput
                className='router-section-input'
                placeholder='0x...'
                value={tx.to}
                onChange={(e, { value }) => setTx({ ...tx, to: value })}
              />
            </AppField>
          </AppFormRow>
          <AppFormRow>
            <AppField label='金额（ETH）'>
              <AppInputNumber
                className='router-section-input'
                fluid
                placeholder='0.01'
                value={tx.value}
                onChange={(e, { value }) => setTx({ ...tx, value })}
                min={0}
                step={0.001}
              />
            </AppField>
          </AppFormRow>
          <AppButton className='router-section-button' color='blue' loading={loading} onClick={sendTx}>
            发送
          </AppButton>
        </div>
      </AppSection>
    </div>
  );
};

export default WalletPage;
