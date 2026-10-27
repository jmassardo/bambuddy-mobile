import React, { useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '@/api/finance';
import { reportsApi } from '@/api/reports';
import { Input, PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';
import type { FinanceCenter, FinanceTransaction } from '@/types/api';
import {
  budgetPayload,
  centerCapabilities,
  filterLedger,
  financeAmount,
  financePermissions,
  partialCharge,
} from '@/utils/finance';
import { FinancePolicySection } from '@/components/finance/FinancePolicySection';

type FormKind = 'center' | 'deposit' | 'withdraw' | 'manual' | 'edit';
type Form = {
  kind: FormKind;
  center?: FinanceCenter;
  transaction?: FinanceTransaction;
};

export default function FinanceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission, user } = useAuth();
  const rights = financePermissions(hasPermission, user !== null);
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(!rights.own && rights.admin);
  const adminView = admin && rights.admin;
  const [page, setPage] = useState(0);
  const [type, setType] = useState('all');
  const [centerFilter, setCenterFilter] = useState<number | null>(null);
  const [userFilter, setUserFilter] = useState<number | null>(null);
  const [manageId, setManageId] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [canPrint, setCanPrint] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'none' | 'monthly' | 'total'>('monthly');
  const [budget, setBudget] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [formUser, setFormUser] = useState<number | null>(null);
  const [formCenter, setFormCenter] = useState<number | null>(null);
  const [error, setError] = useState('');
  const label = (value: string) =>
    t(`finance.${value}`, { defaultValue: value });
  const flags = useQuery({
    queryKey: ['ui-flags'],
    queryFn: reportsApi.flags,
    enabled: rights.access,
  });
  const centers = useQuery({
    queryKey: ['finance', 'centers', adminView],
    queryFn: () => financeApi.centers(adminView),
    enabled: rights.access,
  });
  const balance = useQuery({
    queryKey: ['finance', 'balance', adminView ? userFilter : 'me'],
    queryFn: () =>
      adminView && userFilter !== null
        ? financeApi.userBalance(userFilter)
        : financeApi.balance(),
    enabled: adminView ? rights.all && userFilter !== null : rights.own,
  });
  const users = useQuery({
    queryKey: ['finance', 'users'],
    queryFn: financeApi.users,
    enabled:
      rights.admin &&
      (hasPermission('users:read') || hasPermission('users:read_slim')),
  });
  const ledger = useQuery({
    queryKey: ['finance', 'ledger', adminView, userFilter],
    queryFn: async () => {
      // The server supports user filtering only. Read every page before applying
      // center/type filters so filtered pagination never silently omits entries.
      const items: FinanceTransaction[] = [];
      let offset = 0;
      while (true) {
        const batch = await financeApi.ledger(
          adminView,
          offset,
          userFilter ?? undefined,
        );
        items.push(...batch.items);
        offset += batch.items.length;
        if (offset >= batch.total || batch.items.length === 0) break;
      }
      return items;
    },
    enabled: adminView ? rights.all : rights.own,
  });
  const members = useQuery({
    queryKey: ['finance', 'members', manageId],
    queryFn: () => financeApi.center(manageId!),
    enabled: adminView && rights.admin && manageId !== null,
  });
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      setError('');
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err: Error) => {
      setError(err.message);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
  function perform(operation: () => Promise<unknown>) {
    setError('');
    mutation.mutate(operation);
  }
  function confirm(title: string, operation: () => Promise<unknown>) {
    Alert.alert(
      label(title),
      label(
        'This action recalculates balances and cannot be undone. Continue?',
      ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: label('Confirm'),
          style: 'destructive',
          onPress: () => perform(operation),
        },
      ],
    );
  }
  function open(next: Form) {
    setError('');
    setForm(next);
    setName(next.center?.name ?? '');
    setMode(
      next.center?.monthly_budget != null
        ? 'monthly'
        : next.center?.total_budget != null
        ? 'total'
        : 'none',
    );
    setBudget(
      String(next.center?.monthly_budget ?? next.center?.total_budget ?? ''),
    );
    setAmount(next.transaction ? String(next.transaction.amount) : '');
    setDescription(next.transaction?.description ?? '');
    setFormUser(next.transaction?.user_id ?? null);
    setFormCenter(next.transaction?.cost_center_id ?? null);
    setDate(new Date().toISOString());
  }
  function save() {
    if (!form) return;
    try {
      if (form.kind === 'center') {
        const payload = budgetPayload(mode, budget);
        if (form.center) {
          if (!rights.modify) throw new Error(label('Permission denied'));
          if (!form.center.is_private && !name.trim())
            throw new Error(label('Name is required'));
          const center = form.center;
          perform(async () => {
            if (!center.is_private && name.trim() !== center.name)
              await financeApi.renameCenter(center.id, name.trim());
            return financeApi.budgets(center.id, payload);
          });
        } else {
          if (!rights.create) throw new Error(label('Permission denied'));
          if (!name.trim() || name.trim().length > 150)
            throw new Error(label('Name must contain 1–150 characters'));
          perform(() =>
            financeApi.createCenter({ name: name.trim(), ...payload }),
          );
        }
      } else {
        if (!rights.modify) throw new Error(label('Permission denied'));
        if (formUser === null) throw new Error(label('Select a user'));
        const userId = formUser;
        const numericAmount = financeAmount(amount, form.kind === 'edit');
        if (form.kind === 'edit' && form.transaction) {
          const txId = form.transaction.id;
          perform(() =>
            financeApi.edit(txId, {
              user_id: userId,
              cost_center_id: formCenter,
              amount: numericAmount,
              description,
            }),
          );
        } else if (form.kind === 'manual') {
          if (formCenter === null)
            throw new Error(label('Select a cost center'));
          if (
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
              date,
            ) ||
            !Number.isFinite(Date.parse(date))
          )
            throw new Error(label('Enter a valid ISO date with timezone'));
          const centerId = formCenter;
          perform(() =>
            financeApi.manual({
              user_id: userId,
              cost_center_id: centerId,
              amount: numericAmount,
              description,
              created_at: new Date(date).toISOString(),
            }),
          );
        } else if (form.kind === 'deposit' || form.kind === 'withdraw') {
          const kind = form.kind;
          perform(() =>
            financeApi.adjust(userId, kind, {
              amount: numericAmount,
              cost_center_id: formCenter,
              description,
            }),
          );
        }
      }
    } catch (err) {
      setError(label(err instanceof Error ? err.message : 'Invalid input'));
    }
  }
  const money = (value: number | null | undefined) => {
    if (value == null) return '—';
    const currency = balance.data?.currency ?? flags.data?.currency ?? 'USD';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(value);
    } catch {
      return `${currency} ${value.toFixed(2)}`;
    }
  };
  const userName = (id: number) =>
    users.data?.find(u => u.id === id)?.username ?? `#${id}`;
  const centerName = (id: number | null) =>
    centers.data?.find(c => c.id === id)?.name ??
    (id === null ? label('Personal wallet') : `#${id}`);
  const filtered = filterLedger(ledger.data ?? [], type, centerFilter);
  React.useEffect(() => {
    setPage(current =>
      Math.min(current, Math.max(0, Math.ceil(filtered.length / 50) - 1)),
    );
  }, [filtered.length]);
  const pageItems = filtered.slice(page * 50, (page + 1) * 50);
  const button = (text: string, onPress: () => void, disabled = false) => (
    <PrimaryButton
      key={text}
      label={label(text)}
      onPress={onPress}
      disabled={disabled || mutation.isPending}
    />
  );
  const chooseUser = (
    selected: number | null,
    onSelect: (id: number | null) => void,
    optional = false,
  ) => (
    <View style={styles.group}>
      {optional &&
        button(selected === null ? 'All users ✓' : 'All users', () =>
          onSelect(null),
        )}
      {users.data?.map(u =>
        button(`${u.username}${selected === u.id ? ' ✓' : ''}`, () =>
          onSelect(u.id),
        ),
      )}
      {!users.data?.length && (
        <Input
          label={label('User ID')}
          keyboardType="number-pad"
          value={selected === null ? '' : String(selected)}
          onChangeText={v => onSelect(/^[1-9]\d*$/.test(v) ? Number(v) : null)}
        />
      )}
    </View>
  );
  const chooseCenter = (
    selected: number | null,
    onSelect: (id: number | null) => void,
    nullableLabel: string,
    ledgerChoices = false,
  ) => (
    <View style={styles.group}>
      {button(`${nullableLabel}${selected === null ? ' ✓' : ''}`, () =>
        onSelect(null),
      )}
      {centers.data?.map(c =>
        button(`${c.name}${selected === c.id ? ' ✓' : ''}`, () =>
          onSelect(c.id),
        ),
      )}
      {ledgerChoices &&
        Array.from(new Set((ledger.data ?? []).map(tx => tx.cost_center_id)))
          .filter(
            (id): id is number =>
              id !== null && !centers.data?.some(center => center.id === id),
          )
          .map(id =>
            button(`#${id}${selected === id ? ' ✓' : ''}`, () => onSelect(id)),
          )}
    </View>
  );
  if (!rights.access)
    return (
      <View style={styles.content}>
        <Text style={{ color: colors.text }}>
          {label(
            'Finance requires a signed-in account with cost-center permissions.',
          )}
        </Text>
      </View>
    );
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={ledger.isFetching || centers.isFetching}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['finance'] });
            }}
          />
        }
      >
        <SectionCard title={label('Finance')}>
          {rights.own &&
            button('Personal view', () => {
              setAdmin(false);
              setPage(0);
              setCenterFilter(null);
              setUserFilter(null);
            })}
          {rights.admin &&
            button('Administration', () => {
              setAdmin(true);
              setPage(0);
              setCenterFilter(null);
            })}
          {adminView &&
            rights.all &&
            chooseUser(
              userFilter,
              id => {
                setUserFilter(id);
                setPage(0);
              },
              true,
            )}
          {balance.data && (
            <Text style={{ color: colors.text }}>
              {label('Wallet balance')}: {money(balance.data.balance)}
            </Text>
          )}
          {balance.isError && (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {balance.error.message}
            </Text>
          )}
          {adminView &&
            rights.create &&
            button('Create cost center', () => open({ kind: 'center' }))}
          {adminView && rights.modify && (
            <>
              {button('Deposit', () => open({ kind: 'deposit' }))}
              {button('Withdraw', () => open({ kind: 'withdraw' }))}
              {button('Manual print charge', () => open({ kind: 'manual' }))}
            </>
          )}
        </SectionCard>
        <SectionCard
          title={label('Cost centers')}
          subtitle={label(
            'Available budget includes active print reservations. Unlimited is different from zero.',
          )}
        >
          {centers.isPending && (
            <Text style={{ color: colors.text }}>{label('Loading…')}</Text>
          )}
          {centers.isError && (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {centers.error.message}
            </Text>
          )}
          {centers.data?.map(center => {
            const capabilities = centerCapabilities(
              center,
              adminView && rights.modify,
            );
            return (
              <View key={center.id} style={styles.group}>
                <Text style={{ color: colors.text }}>
                  {center.name} ·{' '}
                  {label(center.is_private ? 'Private' : 'Shared')} ·{' '}
                  {label(center.is_active ? 'Active' : 'Inactive')}
                </Text>
                <Text style={{ color: colors.text }}>
                  {label('Balance')}: {money(center.total_balance)} ·{' '}
                  {label('Budget mode')}: {label(center.budget_mode)}
                </Text>
                <Text style={{ color: colors.text }}>
                  {label('Limit')}:{' '}
                  {center.budget_limit === null
                    ? label('Unlimited')
                    : money(center.budget_limit)}{' '}
                  · {label('Used')}: {money(center.budget_used)} ·{' '}
                  {label('Available')}:{' '}
                  {center.budget_available === null
                    ? label('Unlimited')
                    : money(center.budget_available)}
                </Text>
                <Text style={{ color: colors.text }}>
                  {label('Print entitlement')}:{' '}
                  {label(center.can_print ? 'Yes' : 'No')}
                </Text>
                {center.budget_available !== null &&
                  center.budget_available <= 0 && (
                    <Text style={{ color: colors.warning }}>
                      {label('Budget exhausted — new prints may be denied.')}
                    </Text>
                  )}
                {capabilities.budget &&
                  button(
                    center.is_private ? 'Edit budget' : 'Edit name and budget',
                    () => open({ kind: 'center', center }),
                  )}
                {capabilities.members &&
                  button('Manage members', () => {
                    setManageId(manageId === center.id ? null : center.id);
                    setMemberId(null);
                  })}
                {adminView &&
                  rights.admin &&
                  !rights.modify &&
                  !center.is_private &&
                  button('View members', () =>
                    setManageId(manageId === center.id ? null : center.id),
                  )}
                {capabilities.delete &&
                  button('Delete cost center', () =>
                    confirm('Delete cost center?', () =>
                      financeApi.deleteCenter(center.id),
                    ),
                  )}
              </View>
            );
          })}
        </SectionCard>
        {adminView && manageId !== null && (
          <SectionCard title={`${label('Members')} · ${centerName(manageId)}`}>
            {members.isError && (
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {members.error.message}
              </Text>
            )}
            {members.data?.members.map(member => (
              <View key={member.id} style={styles.group}>
                <Text style={{ color: colors.text }}>
                  {userName(member.user_id)} · {label('Can print')}:{' '}
                  {label(member.can_print ? 'Yes' : 'No')}
                </Text>
                {rights.modify && !members.data?.is_private && (
                  <>
                    {button('Edit entitlement', () => {
                      setMemberId(member.user_id);
                      setCanPrint(member.can_print);
                    })}
                    {button('Remove member', () =>
                      confirm('Remove member?', () =>
                        financeApi.removeMember(manageId, member.user_id),
                      ),
                    )}
                  </>
                )}
              </View>
            ))}
            {rights.modify && !members.data?.is_private && (
              <>
                {chooseUser(memberId, setMemberId)}
                <Text style={{ color: colors.text }}>{label('Can print')}</Text>
                <Switch
                  accessibilityLabel={label('Can print')}
                  value={canPrint}
                  onValueChange={setCanPrint}
                />
                {button(
                  'Add / update membership',
                  () => {
                    if (memberId !== null)
                      perform(() =>
                        financeApi.member(manageId, memberId, canPrint),
                      );
                  },
                  memberId === null || !members.isSuccess,
                )}
              </>
            )}
          </SectionCard>
        )}
        {(adminView ? rights.all : rights.own) && (
          <SectionCard title={label('Transactions')}>
            <View style={styles.group}>
              {[
                'all',
                'print_charge',
                'deposit',
                'withdraw',
                'manual_adjustment',
              ].map(kind =>
                button(`${kind}${type === kind ? ' ✓' : ''}`, () => {
                  setType(kind);
                  setPage(0);
                }),
              )}
            </View>
            {chooseCenter(
              centerFilter,
              id => {
                setCenterFilter(id);
                setPage(0);
              },
              'All centers',
              true,
            )}
            {ledger.isPending && (
              <Text style={{ color: colors.text }}>{label('Loading…')}</Text>
            )}
            {ledger.isError && (
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {ledger.error.message}
              </Text>
            )}
            {pageItems.map(tx => (
              <View key={tx.id} style={styles.group}>
                <Text style={{ color: colors.text }}>
                  {userName(tx.user_id)} · {centerName(tx.cost_center_id)} ·{' '}
                  {label(tx.transaction_type)}
                </Text>
                <Text style={{ color: colors.text }}>
                  {tx.description ?? '—'}
                </Text>
                {partialCharge(tx.description) && (
                  <Text style={{ color: colors.warning }}>
                    {label('Partial print')}:{' '}
                    {label(partialCharge(tx.description)!)}
                  </Text>
                )}
                <Text style={{ color: colors.text }}>
                  {money(tx.amount)} · {label('Balance after')}:{' '}
                  {money(tx.balance_after)} ·{' '}
                  {new Date(tx.created_at).toLocaleString()}
                </Text>
                {adminView && rights.modify && (
                  <>
                    {button('Edit transaction', () =>
                      open({ kind: 'edit', transaction: tx }),
                    )}
                    {button('Delete transaction', () =>
                      confirm('Delete transaction?', () =>
                        financeApi.deleteTransaction(tx.id),
                      ),
                    )}
                  </>
                )}
              </View>
            ))}
            {!ledger.isPending && !ledger.isError && !filtered.length && (
              <Text style={{ color: colors.text }}>
                {label('No transactions')}
              </Text>
            )}
            <Text style={{ color: colors.text }}>
              {page + 1} / {Math.max(1, Math.ceil(filtered.length / 50))} ·{' '}
              {filtered.length}
            </Text>
            {button('Previous page', () => setPage(p => p - 1), page === 0)}
            {button(
              'Next page',
              () => setPage(p => p + 1),
              (page + 1) * 50 >= filtered.length,
            )}
          </SectionCard>
        )}
        {error && !form && (
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {error}
          </Text>
        )}
        {mutation.isPending && (
          <Text style={{ color: colors.text }}>{label('Saving…')}</Text>
        )}
        <FinancePolicySection />
      </ScrollView>
      <Modal
        visible={form !== null}
        onRequestClose={() => {
          if (!mutation.isPending) setForm(null);
        }}
        animationType="slide"
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { backgroundColor: colors.background },
          ]}
        >
          <Text style={{ color: colors.text }}>
            {label(form?.kind ?? 'Finance')}
          </Text>
          {form?.kind === 'center' ? (
            <>
              {!form.center?.is_private && (
                <Input
                  label={label('Name')}
                  value={name}
                  onChangeText={setName}
                  maxLength={150}
                />
              )}
              {['none', 'monthly', 'total'].map(value =>
                button(`${value}${mode === value ? ' ✓' : ''}`, () =>
                  setMode(value as typeof mode),
                ),
              )}
              {mode !== 'none' && (
                <Input
                  label={label('Budget amount (0 blocks printing)')}
                  value={budget}
                  onChangeText={setBudget}
                  keyboardType="decimal-pad"
                />
              )}
            </>
          ) : (
            <>
              <Text style={{ color: colors.text }}>{label('User')}</Text>
              {chooseUser(formUser, setFormUser)}
              <Text style={{ color: colors.text }}>{label('Cost center')}</Text>
              {chooseCenter(
                formCenter,
                setFormCenter,
                form?.kind === 'manual'
                  ? 'Select required center'
                  : 'No center',
              )}
              <Input
                label={label(
                  form?.kind === 'edit'
                    ? 'Signed amount'
                    : 'Amount greater than zero',
                )}
                value={amount}
                onChangeText={setAmount}
                keyboardType={
                  form?.kind === 'edit'
                    ? 'numbers-and-punctuation'
                    : 'decimal-pad'
                }
              />
              <Input
                label={label('Description')}
                value={description}
                onChangeText={setDescription}
              />
              {form?.kind === 'manual' && (
                <Input
                  label={label('Charge date (ISO with timezone)')}
                  value={date}
                  onChangeText={setDate}
                  autoCapitalize="none"
                />
              )}
            </>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {error}
            </Text>
          )}
          {button(mutation.isPending ? 'Saving…' : 'Save', save)}
          {button('Cancel', () => setForm(null))}
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  group: { gap: spacing.sm, paddingVertical: spacing.sm },
});
