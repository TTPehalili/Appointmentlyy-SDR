"""The locked output schema. Single source of truth: never rename, reorder or add columns here."""

OUTPUT_COLUMNS = [
    "Company Name",
    "Company URL",
    "First Name",
    "Last Name",
    "Title/Role",
    "Email",
    "Phone Number",
    "LinkedIn Profile link",
    "Number of Seats",
    "Locations",
    "ARR",
]


def empty_row() -> dict:
    return {c: "" for c in OUTPUT_COLUMNS}


def validate_row(row: dict) -> None:
    """Raise if a row would break the locked schema."""
    if list(row.keys()) != OUTPUT_COLUMNS:
        raise ValueError(f"row columns {list(row.keys())} do not match the locked schema")
    for k, v in row.items():
        if not isinstance(v, str):
            raise ValueError(f"{k} must be text, got {type(v).__name__}")
