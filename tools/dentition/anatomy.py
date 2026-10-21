"""Reference data for the dentition pipeline: tooth types, names, numbering and textbook dimensions.

Dimensions are the average permanent-tooth measurements tabulated in Wheeler's Dental Anatomy,
Physiology and Occlusion (Nelson, 10th ed.), in millimetres. They are used only to place the cemento-
enamel junction on each mesh and to size the third-molar placeholders, never to draw a tooth.
"""

from __future__ import annotations

# Position 1..8 inside a quadrant (FDI second digit).
TYPES = {
    1: 'central_incisor',
    2: 'lateral_incisor',
    3: 'canine',
    4: 'first_premolar',
    5: 'second_premolar',
    6: 'first_molar',
    7: 'second_molar',
    8: 'third_molar',
}

TYPE_NAMES = {
    'en': {
        'central_incisor': 'central incisor',
        'lateral_incisor': 'lateral incisor',
        'canine': 'canine',
        'first_premolar': 'first premolar',
        'second_premolar': 'second premolar',
        'first_molar': 'first molar',
        'second_molar': 'second molar',
        'third_molar': 'third molar (wisdom tooth)',
    },
    'fa': {
        'central_incisor': 'دندان پیش میانی',
        'lateral_incisor': 'دندان پیش کناری',
        'canine': 'دندان نیش',
        'first_premolar': 'دندان آسیای کوچک اول',
        'second_premolar': 'دندان آسیای کوچک دوم',
        'first_molar': 'دندان آسیای بزرگ اول',
        'second_molar': 'دندان آسیای بزرگ دوم',
        'third_molar': 'دندان آسیای بزرگ سوم (عقل)',
    },
}

# FDI quadrant -> arch and patient side.
QUADRANTS = {1: ('upper', 'right'), 2: ('upper', 'left'), 3: ('lower', 'left'), 4: ('lower', 'right')}

ARCH_NAMES = {'en': {'upper': 'maxillary', 'lower': 'mandibular'}, 'fa': {'upper': 'فک بالا', 'lower': 'فک پایین'}}
SIDE_NAMES = {'en': {'left': 'left', 'right': 'right'}, 'fa': {'left': 'چپ', 'right': 'راست'}}

# BodyParts3D 4.x part (FMA id) for each FDI tooth, from isa_parts_list_e.txt. Third molars are not in
# BodyParts3D.
FMA = {
    '11': 'FMA55681', '12': 'FMA55680', '13': 'FMA55798', '14': 'FMA55689', '15': 'FMA55688', '16': 'FMA55698', '17': 'FMA55697',
    '21': 'FMA55682', '22': 'FMA55683', '23': 'FMA55799', '24': 'FMA55690', '25': 'FMA55691', '26': 'FMA55699', '27': 'FMA55700',
    '31': 'FMA57143', '32': 'FMA57141', '33': 'FMA55687', '34': 'FMA55693', '35': 'FMA55692', '36': 'FMA55704', '37': 'FMA55703',
    '41': 'FMA57142', '42': 'FMA57140', '43': 'FMA55686', '44': 'FMA55694', '45': 'FMA55695', '46': 'FMA55705', '47': 'FMA55706',
}

# Wheeler averages, mm: crown length (cervico-incisal / -occlusal), root length, mesiodistal crown
# diameter, labio/bucco-lingual crown diameter, mesial curvature of the cervical line.
WHEELER = {
    'upper': {
        1: dict(crown=10.5, root=13.0, md=8.5, bl=7.0, cervical=3.5),
        2: dict(crown=9.0, root=13.0, md=6.5, bl=6.0, cervical=3.0),
        3: dict(crown=10.0, root=17.0, md=7.5, bl=8.0, cervical=2.5),
        4: dict(crown=8.5, root=14.0, md=7.0, bl=9.0, cervical=1.0),
        5: dict(crown=8.5, root=14.0, md=6.5, bl=9.0, cervical=1.0),
        6: dict(crown=7.5, root=12.5, md=10.0, bl=11.0, cervical=1.0),
        7: dict(crown=7.0, root=11.5, md=9.0, bl=11.0, cervical=1.0),
        8: dict(crown=6.5, root=11.0, md=8.5, bl=10.0, cervical=1.0),
    },
    'lower': {
        1: dict(crown=9.0, root=12.5, md=5.0, bl=6.0, cervical=3.0),
        2: dict(crown=9.5, root=14.0, md=5.5, bl=6.0, cervical=3.0),
        3: dict(crown=11.0, root=16.0, md=7.0, bl=7.5, cervical=2.5),
        4: dict(crown=8.5, root=14.0, md=7.0, bl=7.5, cervical=1.0),
        5: dict(crown=8.0, root=14.5, md=7.0, bl=8.0, cervical=1.0),
        6: dict(crown=7.5, root=14.0, md=11.0, bl=10.5, cervical=1.0),
        7: dict(crown=7.0, root=13.0, md=10.5, bl=10.0, cervical=1.0),
        8: dict(crown=7.0, root=11.0, md=10.0, bl=9.5, cervical=1.0),
    },
}


def fdi_to_universal(fdi: str) -> int:
    """Universal (ADA) number 1-32: 1 = upper right third molar, 16 = upper left third molar,
    17 = lower left third molar, 32 = lower right third molar."""
    q, p = int(fdi[0]), int(fdi[1])
    if q == 1:
        return 9 - p
    if q == 2:
        return 8 + p
    if q == 3:
        return 25 - p
    return 24 + p


def tooth_record(fdi: str) -> dict:
    q, p = int(fdi[0]), int(fdi[1])
    arch, side = QUADRANTS[q]
    kind = TYPES[p]
    names = {}
    for lang in ('en', 'fa'):
        t, a, s = TYPE_NAMES[lang][kind], ARCH_NAMES[lang][arch], SIDE_NAMES[lang][side]
        if lang == 'en':
            names[lang] = f'{a.capitalize()} {s} {t}'
        else:
            names[lang] = f'{t} {a} سمت {s}'
    return {
        'fdi': fdi,
        'universal': fdi_to_universal(fdi),
        'quadrant': q,
        'position': p,
        'type': kind,
        'arch': arch,
        'side': side,
        'name': names,
    }
