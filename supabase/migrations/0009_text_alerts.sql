-- My Office Bot — text message lead alerts (decision D56, SPEC §8 consent rules).
-- Texts go only to people who agreed: the account owner by ticking the consent box in the app, anyone
-- else by replying YES to a confirmation text. STOP blocks texts to that number everywhere.
-- A business only sends texts once its sms_status is 'active' (set by the platform admin after the
-- carrier registration is approved).

create or replace function private.phone_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
              then right(regexp_replace(p, '\D', '', 'g'), 10) end
$$;

-- Turn texts on for a person. Returns 'on' (consent recorded now) or 'pending' (we must text them for a YES).
create or replace function public.request_text_alerts(p_contact uuid, p_self_consent boolean, p_wording text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
  c public.contacts;
  my_email text;
begin
  select * into c from public.contacts where id = p_contact and account_id = acct and removed_at is null;
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  if private.phone_key(c.phone) is null then
    raise exception 'Add a mobile number for % first', c.name using errcode = '22023';
  end if;
  if c.phone_opted_out then
    raise exception '% replied STOP to our texts. They can text START to % to turn texts back on.', c.name, 'our number'
      using errcode = '22023';
  end if;

  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if p_self_consent then
    if c.email is null or lower(c.email) <> my_email then
      raise exception 'Only % can agree for themselves. Send them a confirmation text instead.', c.name using errcode = '42501';
    end if;
    update public.contacts set
      alert_sms = true,
      consent_status = 'confirmed',
      consent_evidence = jsonb_build_object('method', 'in_app_checkbox', 'wording', left(coalesce(p_wording, ''), 500),
                                            'user_id', auth.uid(), 'phone', c.phone, 'at', now())
    where id = c.id;
    return 'on';
  end if;

  update public.contacts set
    alert_sms = true,
    consent_status = case when consent_status = 'confirmed' and consent_evidence ->> 'phone' = c.phone then 'confirmed' else 'pending' end
  where id = c.id
  returning consent_status into c.consent_status;
  return case when c.consent_status = 'confirmed' then 'on' else 'pending' end;
end;
$$;

create or replace function public.stop_text_alerts(p_contact uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid := private.require_account(true);
begin
  update public.contacts set alert_sms = false where id = p_contact and account_id = acct and removed_at is null;
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------- texts coming in (Twilio webhook, service role)
-- YES confirms pending people at that number; STOP/START flip the opt-out everywhere.
-- Returns the reply to send, or null. (Twilio itself answers STOP, START and HELP on our numbers.)

create or replace function public.sms_inbound(p_from text, p_body text, p_message_sid text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := private.phone_key(p_from);
  word text := upper(regexp_replace(trim(coalesce(p_body, '')), '[^A-Za-z]', '', 'g'));
  confirmed int := 0;
  biz text;
begin
  if k is null then
    return null;
  end if;

  if word in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT') then
    update public.contacts set phone_opted_out = true where private.phone_key(phone) = k;
    return null;
  end if;

  if word in ('START', 'UNSTOP') then
    update public.contacts set phone_opted_out = false where private.phone_key(phone) = k;
    return null;
  end if;

  if word in ('YES', 'Y', 'YEP', 'YEAH', 'OK', 'OKAY', 'AGREE') then
    with done as (
      update public.contacts c set
        consent_status = 'confirmed',
        phone_opted_out = false,
        consent_evidence = jsonb_build_object('method', 'sms_yes', 'message_sid', p_message_sid, 'phone', c.phone, 'at', now())
      where private.phone_key(c.phone) = k and c.alert_sms and c.consent_status = 'pending' and c.removed_at is null
      returning c.account_id
    )
    select count(*), min(a.name) into confirmed, biz from done join public.accounts a on a.id = done.account_id;
    if confirmed > 0 then
      return format('My Office Bot: You''re set. You''ll get new-lead texts for %s. Reply STOP anytime to opt out.', biz);
    end if;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------- security

revoke all on function private.phone_key(text), public.request_text_alerts(uuid, boolean, text),
  public.stop_text_alerts(uuid), public.sms_inbound(text, text, text) from public, anon;
grant execute on function public.request_text_alerts(uuid, boolean, text), public.stop_text_alerts(uuid) to authenticated;
revoke all on function public.sms_inbound(text, text, text) from authenticated;
grant execute on function public.sms_inbound(text, text, text) to service_role;
