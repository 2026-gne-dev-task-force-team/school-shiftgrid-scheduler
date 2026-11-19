import JSZip from 'jszip';
import { legendOf } from './pdf.js';

// 최소 HWPX(OWPML) 직접 생성 — 한글이 여는지는 업무 PC 에서 검수한다.
// 셀 음영 대신 글자색·굵게를 쓴다(설계 4번: 배경색 옵션 없음). 시트마다 표 하나, 사이에 쪽 나눔.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NS = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

// 글자 모양 목록: 0 기본 · 1 굵게 · 2 파랑 굵게 · 3 빨강 굵게 · 4 음영 대신 밑줄 굵게(과학실)
function header(st) {
  const cp = (id, color, bold, under) => `<hh:charPr id="${id}" height="1000" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}<hh:underline type="${under ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="${color}"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`;
  const font = (lang) => `<hh:fontface lang="${lang}" fontCnt="1"><hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"/></hh:fontface>`;
  const bf = (id, sides) => `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>${['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder'].map((n) => `<hh:${n} type="${sides ? 'SOLID' : 'NONE'}" width="0.12 mm" color="#000000"/>`).join('')}<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;
  return `${XML}<hh:head ${NS} version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces itemCnt="7">${['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'].map(font).join('')}</hh:fontfaces><hh:borderFills itemCnt="2">${bf(1, false)}${bf(2, true)}</hh:borderFills><hh:charProperties itemCnt="5">${cp(0, '#000000', false, false)}${cp(1, '#000000', true, false)}${cp(2, st.changcheColor, true, false)}${cp(3, st.specialistColor, true, false)}${cp(4, '#000000', true, true)}</hh:charProperties><hh:paraProperties itemCnt="2"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hh:paraPr><hh:paraPr id="1" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="CENTER" vertical="CENTER"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/></hh:paraPr></hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList></hh:head>`;
}

const run = (cp, text) => `<hp:run charPrIDRef="${cp}"><hp:t>${esc(text)}</hp:t></hp:run>`;
const para = (cp, text, pp = 0, extra = '') => `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${extra}${run(cp, text)}</hp:p>`;

function table(sh, startId) {
  const colW = [6000, ...Array(Math.max(1, sh.header.length - 1)).fill(7600)];
  const rowH = 3200;
  const tcell = (c, ci, ri, head) => {
    const cp = head ? 1 : c.kind === 'changche' ? 2 : c.kind === 'specialist' ? 3 : c.shade ? 4 : 0;
    const lines = String(c.text).split('\n');
    const ps = lines.map((ln) => para(cp, ln, 1)).join('');
    return `<hp:tc name="" header="${head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${ps}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${colW[ci] ?? 7600}" height="${rowH}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
  };
  const rows = [sh.header, ...sh.rows];
  const trs = rows.map((r, ri) => `<hp:tr>${r.map((c, ci) => tcell(c, ci, ri, ri === 0)).join('')}</hp:tr>`).join('');
  const w = colW.reduce((a, b) => a + b, 0);
  return `<hp:tbl id="${startId}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${colW.length}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${rowH * rows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>${trs}</hp:tbl>`;
}

function section(sheets, docTitle, st, duties) {
  const secPr = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:pagePr landscape="NARROWLY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="2835" footer="2835" gutter="0" left="4252" right="4252" top="4252" bottom="2835"/></hp:pagePr></hp:secPr>`;
  let id = 1000;
  const body = (sheets.length ? sheets : [{ title: docTitle, header: [{ text: '' }], rows: [] }]).map((sh, i) => {
    const t = para(1, `${sh.title} · ${docTitle}`, 0, i === 0 ? `<hp:run charPrIDRef="0">${secPr}</hp:run>` : '').replace('pageBreak="0"', i === 0 ? 'pageBreak="0"' : 'pageBreak="1"');
    return t + `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${table(sh, id++)}</hp:run></hp:p>`;
  }).join('');
  const legend = para(0, legendOf(st, duties).map(([, t]) => t).join(' · '));
  return `${XML}<hs:sec ${NS}>${body}${legend}</hs:sec>`;
}

export async function makeHwpx(sheets, st, docTitle, duties) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('version.xml', `${XML}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="0" micro="5" buildNumber="0" os="1" xmlVersion="1.4" application="school-timetable" appVersion="0.0.1"/>`);
  zip.file('META-INF/container.xml', `${XML}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`);
  zip.file('Contents/content.hpf', `${XML}<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" version="" unique-identifier="" id=""><opf:metadata><opf:title>${esc(docTitle)}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`);
  zip.file('Contents/header.xml', header(st));
  zip.file('Contents/section0.xml', section(sheets, docTitle, st, duties));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
