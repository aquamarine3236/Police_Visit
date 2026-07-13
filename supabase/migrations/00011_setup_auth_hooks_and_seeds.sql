CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_role text;
  user_prison_id uuid;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT role, prison_id
    INTO user_role, user_prison_id
  FROM public.admin_profiles
  WHERE id = (event->>'user_id')::uuid
    AND is_active = true;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(user_role));
    claims := jsonb_set(claims, '{prison_id}', to_jsonb(user_prison_id));
  ELSE
    claims := jsonb_set(claims, '{app_role}', to_jsonb('anon'));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;
