CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('carrier', 'consultancy')),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, kind)
);

CREATE TABLE user_accounts (
  id uuid PRIMARY KEY,
  entra_subject text NOT NULL UNIQUE,
  email text,
  display_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY,
  user_account_id uuid NOT NULL REFERENCES user_accounts (id),
  organization_id uuid NOT NULL,
  organization_kind text NOT NULL,
  role text NOT NULL CHECK (role IN ('carrier', 'consultant', 'master')),
  carrier_company_id uuid,
  carrier_company_kind text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      role = 'carrier'
      AND organization_kind = 'carrier'
      AND organization_id = carrier_company_id
      AND carrier_company_id IS NOT NULL
      AND carrier_company_kind = 'carrier'
    )
    OR (
      role IN ('consultant', 'master')
      AND organization_kind = 'consultancy'
      AND carrier_company_id IS NULL
      AND carrier_company_kind IS NULL
    )
  ),
  FOREIGN KEY (organization_id, organization_kind)
    REFERENCES organizations (id, kind),
  FOREIGN KEY (carrier_company_id, carrier_company_kind)
    REFERENCES organizations (id, kind),
  UNIQUE (user_account_id)
);

CREATE INDEX organization_memberships_organization_id_idx
  ON organization_memberships (organization_id);

CREATE INDEX organization_memberships_carrier_company_id_idx
  ON organization_memberships (carrier_company_id)
  WHERE carrier_company_id IS NOT NULL;
