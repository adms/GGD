"""Extract factual configuration fields from acquired PalDB HTML snapshots.

Page source and hash remain attached. These are community-published game data,
not locally extracted game DataTables or finished GGD hero definitions.
"""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin


class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        return re.sub(r'\s+', ' ', ' '.join(c.text() if isinstance(c, Node) else c for c in self.children)).strip()

    def has_class(self, value):
        return value in self.attrs.get('class', '').split()


class Tree(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('document')
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        if tag in {'tr', 'td', 'th', 'li'}:
            for i in range(len(self.stack)-1, 0, -1):
                if self.stack[i].tag == tag:
                    self.stack = self.stack[:i]
                    break
                if self.stack[i].tag in {'table', 'ul', 'ol'}:
                    break
        node = Node(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse(source):
    path = Path(source['localPath'])
    blob = path.read_bytes()
    assert len(blob) == source['bytes'] and hashlib.sha256(blob).hexdigest() == source['sha256']
    parser = Tree()
    parser.feed(blob.decode('utf-8'))
    nodes = list(parser.root.walk())
    tabs=[n for n in nodes if n.has_class('tab-pane')]
    active_tabs=[n for n in tabs if n.has_class('active')]
    if active_tabs:nodes=list(active_tabs[0].walk())
    sections = {}
    for heading in nodes:
        if heading.tag != 'h5' or heading.text() not in {'Stats', 'Movement', 'Others'}:
            continue
        pairs = {}
        for row in heading.parent.walk():
            if not row.has_class('border-bottom'):
                continue
            cells = [x for x in row.children if isinstance(x, Node) and x.tag == 'div']
            if len(cells) >= 2:
                key, value = cells[0].text(), cells[-1].text()
                if re.fullmatch(r'-?\d+(?:\.\d+)?', value):
                    value = float(value) if '.' in value else int(value)
                pairs[key] = value
        sections[heading.text()] = pairs
    partner = None
    for heading in nodes:
        if heading.tag=='h5' and re.match(r'Partner Skill\s*:', heading.text()):
            tiers=[]
            for row in heading.parent.walk():
                if row.tag!='tr':continue
                cells=[c for c in row.children if isinstance(c,Node) and c.tag in {'td','th'}]
                if len(cells)<2 or not cells[0].text().isdigit():continue
                fields=dict((key,float(value)) for key,value in re.findall(r'([A-Za-z][A-Za-z_0-9]*)\s+(-?[\d.]+)',cells[1].text()))
                if fields:tiers.append(dict(level=int(cells[0].text()),values=fields))
            partner=dict(name=heading.text().split(':',1)[1].strip(),tiers=tiers)
    skills = []
    for card in nodes:
        if not card.has_class('activeSkill'):
            continue
        descendants = list(card.walk())
        links = [n for n in descendants if n.tag == 'a' and 'Waza%2F' in n.attrs.get('data-hover', '')]
        if not links:
            continue
        link = links[0]
        header = next(n for n in descendants if n.has_class('itemHead'))
        level = re.search(r'Lv\.\s*(\d+)', header.text())
        power = re.search(r'威力:\s*(\d+)', card.text())
        cooldown_image = next((n for n in descendants if n.tag == 'img' and n.attrs.get('data-bs-title') == 'CoolTime'), None)
        cooldown = re.search(r':\s*([\d.]+)', cooldown_image.parent.text()) if cooldown_image else None
        range_value = next((n.attrs['data-bs-title'] for n in descendants if 'Attack Range' in n.attrs.get('data-bs-title', '')), None)
        code = unquote(link.attrs['data-hover']).split('::')[-1]
        skills.append(dict(code=code, name=link.text(), learnedLevel=int(level.group(1)) if level else None,
                           power=int(power.group(1)) if power else None,
                           cooldownSeconds=float(cooldown.group(1)) if cooldown else None,
                           sourceRangeLabel=range_value, sourceUrl=urljoin(source['url'], link.attrs['href'])))
    version = re.findall(r'v1\.\d+\.\d+', blob.decode('utf-8'))
    return dict(character=source['character'], form=source.get('form', 'normal'), sourceUrl=source['url'],
                sourceFile=source, selectedSourceTab=active_tabs[0].attrs.get('id') if active_tabs else None,
                otherSourceTabs=[n.attrs.get('id') for n in tabs if n not in active_tabs], reportedGameVersion=version[-1] if version else None,
                factualFields=sections, partnerSkill=partner, activeSkills=skills,
                emptyLearnsetMeansNoBossAttacks=False,
                note='Normal Astralym has no level-up learnset on this page; its two tower-boss pages are retained separately. Raw movement -1 is a source sentinel, not an accepted runtime speed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    receipt = json.loads((args.source_root/'acquisition.json').read_text())
    rows = [parse(source) for source in receipt['sources']]
    expected = {'Jetragon': 'JetDragon', 'Cattiva': 'PinkCat', 'Astralym': 'WorldTreeDragon'}
    for row in rows:
        if row['form'] == 'normal':
            assert row['factualFields']['Stats']['Code'] == expected[row['character']]
    data = dict(schema='ggd-palworld-character-settings-source@1', sourceClass='community-game-data-snapshot',
                locale='zh-TW', originalGameDataTablesAcquired=False, ggdHeroImplementation=False, forms=rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps([dict(character=r['character'], form=r['form'], stats=len(r['factualFields'].get('Stats', {})), skills=len(r['activeSkills'])) for r in rows]))


if __name__ == '__main__':
    main()
